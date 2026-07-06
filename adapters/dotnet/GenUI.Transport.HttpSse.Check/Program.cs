// Headless checks for the C# transport floor: the KernelTransportHost broker (in-memory, mirrors
// kernel/test/transport.test.ts) and the concrete HTTP/SSE server (a real loopback round-trip,
// mirrors transports/http-sse/test/sse.test.ts). No test framework — prints PASS/FAIL and exits
// nonzero on any failure. Top-level statements first; all types come after.

using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using GenUI.Kernel;
using GenUI.Transport.HttpSse;

var checker = new Checker();

Support.InMemoryRoundTrip(checker);
await Support.HttpRoundTrip(checker);

return checker.Report();

/// <summary>Minimal assertion recorder: prints a line per check, tallies failures, returns an exit code.</summary>
internal sealed class Checker
{
    private int _failures;

    public void Check(string name, bool ok)
    {
        Console.WriteLine($"  {(ok ? "PASS" : "FAIL")}  {name}");
        if (!ok) _failures++;
    }

    public int Report()
    {
        if (_failures == 0)
        {
            Console.WriteLine("OK: all transport checks passed (in-memory broker + HTTP/SSE loopback).");
            return 0;
        }

        Console.WriteLine($"FAILED: {_failures} transport check(s) failed.");
        return 1;
    }
}

internal static class Support
{
    // A board whose metric reads ui.clicked and whose action assigns it — the same proven
    // assign/read shape the render-adapter check uses, so the transport semantics ride a known bundle.
    private const string ManifestJson =
        """{"type":"manifest","payload":{"namespaces":["ui"],"capabilities":{"board":{},"metric":{},"actions":{}}}}""";

    private const string DocumentJson =
        """
        {"type":"document","payload":{"root":{"capability":"board","id":"root","props":{"title":"GenUI over the wire"},
        "edges":{"children":[
          {"capability":"metric","id":"status","props":{"label":"Clicked"},"edges":{"read":{"value":"ui.clicked"}}},
          {"capability":"actions","id":"go","props":{"label":"Click"},"edges":{"on":{"tap":[{"do":"assign","target":"ui.clicked","args":{"value":true}}]}}}
        ]}}}}
        """;

    public static (JsonObject Manifest, JsonObject Document, Kernel Kernel) BuildKernel()
    {
        var manifest = JsonNode.Parse(ManifestJson)!.AsObject();
        var document = JsonNode.Parse(DocumentJson)!.AsObject();
        var kernel = new Kernel(manifest, document, new InMemoryStateModel(new[] { "ui" }));
        return (manifest, document, kernel);
    }

    // ── In-memory broker: onboard + round-trip + post-Stop inertness ──────────────────────────
    public static void InMemoryRoundTrip(Checker checker)
    {
        var (manifest, document, kernel) = BuildKernel();
        var (hostSide, clientSide) = InMemoryTransport.CreatePair();

        var received = new List<JsonObject>();
        clientSide.Subscribe(received.Add);

        var broker = new KernelTransportHost(manifest, document, kernel, hostSide);
        broker.Start();

        checker.Check("broker onboards with three messages", received.Count == 3);
        checker.Check("first message is the manifest", Gup.TypeOf(received[0]) == "manifest");
        checker.Check("second message is the document", Gup.TypeOf(received[1]) == "document");
        checker.Check("third message is the snapshot patch at rev 0",
            Gup.TypeOf(received[2]) == "patch" && RevOf(received[2]) == 0);

        clientSide.Send(Gup.Message("event", new JsonObject { ["node"] = "go", ["name"] = "tap" }));

        checker.Check("one event broadcasts one patch", received.Count == 4);
        checker.Check("the broadcast patch is at rev 1 and sets ui.clicked",
            Gup.TypeOf(received[^1]) == "patch" && RevOf(received[^1]) == 1 && PatchSetsClicked(received[^1]));

        broker.Stop();
        clientSide.Send(Gup.Message("event", new JsonObject { ["node"] = "go", ["name"] = "tap" }));
        checker.Check("after Stop() the broker is inert", received.Count == 4);
    }

    // ── HTTP/SSE: onboard over a real socket, POST an event, receive the patch back ───────────
    public static async Task HttpRoundTrip(Checker checker)
    {
        var (manifest, document, kernel) = BuildKernel();
        var broker = new KernelTransportHost(manifest, document, kernel);
        var (prefix, baseUrl) = FindFreeLoopback();

        using var server = new SseTransportServer(broker, prefix);
        server.Start();

        using var client = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        try
        {
            using var streamResponse = await client.GetAsync(
                $"{baseUrl}/gup/stream", HttpCompletionOption.ResponseHeadersRead, cts.Token);

            checker.Check("stream responds 200", (int)streamResponse.StatusCode == 200);
            var session = streamResponse.Headers.TryGetValues("X-GUP-Session", out var values)
                ? values.FirstOrDefault()
                : null;
            checker.Check("stream returns a session id", !string.IsNullOrEmpty(session));

            await using var stream = await streamResponse.Content.ReadAsStreamAsync(cts.Token);
            var parser = new SseFrameParser();

            var onboarding = await ReadMessages(stream, parser, 3, cts.Token);
            checker.Check("HTTP onboarding streams three messages", onboarding.Count == 3);
            checker.Check("HTTP first frame is the manifest", Gup.TypeOf(onboarding[0]) == "manifest");
            checker.Check("HTTP second frame is the document", Gup.TypeOf(onboarding[1]) == "document");
            checker.Check("HTTP third frame is the snapshot patch", Gup.TypeOf(onboarding[2]) == "patch");

            var eventBody = Gup.Message("event", new JsonObject { ["node"] = "go", ["name"] = "tap" }).ToJsonString();
            using var content = new StringContent(eventBody, Encoding.UTF8, "application/json");
            using var postResponse = await client.PostAsync($"{baseUrl}/gup/event?session={session}", content, cts.Token);
            checker.Check("event POST is accepted (204)", (int)postResponse.StatusCode == 204);

            var afterEvent = await ReadMessages(stream, parser, 1, cts.Token);
            checker.Check("the event broadcasts a patch back over the stream", afterEvent.Count == 1);
            checker.Check("the streamed patch is rev 1 setting ui.clicked",
                afterEvent.Count == 1 && Gup.TypeOf(afterEvent[0]) == "patch"
                && RevOf(afterEvent[0]) == 1 && PatchSetsClicked(afterEvent[0]));
        }
        catch (OperationCanceledException)
        {
            checker.Check("HTTP round-trip completed before the 10s timeout", false);
        }
    }

    private static async Task<List<JsonObject>> ReadMessages(
        Stream stream, SseFrameParser parser, int count, CancellationToken ct)
    {
        var collected = new List<JsonObject>();
        var buffer = new byte[4096];
        while (collected.Count < count)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(), ct);
            if (read == 0) break;
            collected.AddRange(parser.Push(Encoding.UTF8.GetString(buffer, 0, read)));
        }
        return collected;
    }

    private static (string Prefix, string BaseUrl) FindFreeLoopback()
    {
        for (var port = 8791; port < 8891; port++)
        {
            try
            {
                var probe = new TcpListener(IPAddress.Loopback, port);
                probe.Start();
                probe.Stop();
                return ($"http://localhost:{port}/", $"http://localhost:{port}");
            }
            catch (SocketException)
            {
                // port busy — try the next one
            }
        }
        throw new InvalidOperationException("no free loopback port for the HTTP/SSE check");
    }

    private static int RevOf(JsonObject patchMessage) =>
        patchMessage["payload"]?["rev"]?.GetValue<int>() ?? -1;

    private static bool PatchSetsClicked(JsonObject patchMessage)
    {
        if (patchMessage["payload"]?["ops"] is not JsonArray ops) return false;
        foreach (var opNode in ops)
        {
            if (opNode is JsonObject op
                && op["op"]?.GetValue<string>() == "set"
                && op["path"]?.GetValue<string>() == "ui.clicked"
                && op["value"] is JsonValue v && v.TryGetValue<bool>(out var b) && b)
            {
                return true;
            }
        }
        return false;
    }
}
