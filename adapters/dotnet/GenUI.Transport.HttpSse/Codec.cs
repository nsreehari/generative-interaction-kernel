// Pure SSE framing for GUP messages — no sockets here, so it is unit-testable on its own:
// encode a message to a `data: ...\n\n` frame, and parse a byte stream (which may split frames
// across chunks) back into messages. The C# mirror of transports/http-sse/src/codec.ts.

using System.Text.Json.Nodes;

namespace GenUI.Transport.HttpSse;

public static class Codec
{
    /// <summary>Encode one enveloped GUP message as a single SSE <c>data:</c> frame.</summary>
    public static string EncodeSseFrame(JsonObject message) => $"data: {message.ToJsonString()}\n\n";
}

/// <summary>
/// Incremental SSE frame parser. Feed it decoded chunks (which may contain partial or multiple
/// frames); it returns the GUP messages completed by each chunk. Non-<c>data:</c> lines
/// (comments/heartbeats like <c>:keep-alive</c>, <c>id:</c>, <c>event:</c>) are ignored per the SSE spec.
/// </summary>
public sealed class SseFrameParser
{
    private string _buffer = string.Empty;

    public IReadOnlyList<JsonObject> Push(string chunk)
    {
        _buffer += chunk;
        var messages = new List<JsonObject>();
        int sep;
        while ((sep = _buffer.IndexOf("\n\n", StringComparison.Ordinal)) != -1)
        {
            var frame = _buffer[..sep];
            _buffer = _buffer[(sep + 2)..];

            var data = string.Join("\n", frame
                .Split('\n')
                .Where(line => line.StartsWith("data:", StringComparison.Ordinal))
                .Select(line =>
                {
                    var value = line[5..];
                    return value.StartsWith(' ') ? value[1..] : value;
                }));

            if (data.Length > 0 && JsonNode.Parse(data) is JsonObject obj)
                messages.Add(obj);
        }
        return messages;
    }
}
