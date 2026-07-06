// The BUNDLE model + loader — the C# mirror of the React floor's bundle.ts.
//
// A BUNDLE is the unit the generic host runs: { manifest, document, state, effects }. The Reactor
// sample, a profile app, and any hosted surface are all just bundles handed to a host. `LoadBundle`
// stands up a runtime for one (seeded store + kernel) and returns a GenUIController the toolkit
// binding renders. This lives in the renderer-agnostic island (System.Text.Json + the kernel only),
// so both the offline checks and the Reactor/WinUI binding load bundles the same way.
//
// The JSON parts (manifest, document, seed state) are pure data — authoring an app is authoring
// JSON, not C#. Native code a bundle needs (an effect orchestrator; toolkit views are attached at
// the binding edge) rides alongside on the non-serializable Bundle.

using System.Text.Json.Nodes;
using GenUI.Kernel;
using GenKernel = GenUI.Kernel.Kernel;

namespace GenUI.Render;

/// <summary>The JSON-only part of a bundle — safe to serialize, store, or embed.</summary>
public sealed record SerializableBundle(
    JsonObject Manifest,
    JsonObject Document,
    IReadOnlyDictionary<string, JsonNode?>? State = null);

/// <summary>A full bundle: the JSON parts plus any native code the bundle needs. Effects is the
/// orchestrator that services <c>invoke</c>/<c>confirm</c>/<c>navigate</c>; null = a no-op host.</summary>
public sealed record Bundle(
    JsonObject Manifest,
    JsonObject Document,
    IReadOnlyDictionary<string, JsonNode?>? State = null,
    IOrchestrator? Effects = null);

/// <summary>A bundle's live runtime: the controller plus the state model it reads/writes. Most hosts
/// want only the controller (<see cref="BundleLoader.LoadBundle"/>); the state is exposed for the
/// rare host that must bridge two bundles across kernel boundaries.</summary>
public sealed record BundleRuntime(GenUIController Controller, InMemoryStateModel State);

/// <summary>Stands up a runtime for a bundle. Mirrors bundle.ts (<c>seedState</c>/<c>loadBundle</c>).</summary>
public static class BundleLoader
{
    /// <summary>Build a seeded state model from a manifest's namespaces and a bundle's seed values.</summary>
    public static InMemoryStateModel SeedState(
        JsonObject manifestMessage,
        IReadOnlyDictionary<string, JsonNode?>? state = null)
    {
        JsonObject manifest = Json.Unwrap(manifestMessage);
        var namespaces = new List<string>();
        if (manifest["namespaces"] is JsonArray arr)
        {
            foreach (JsonNode? ns in arr)
            {
                if (ns is not null)
                {
                    namespaces.Add(ns.GetValue<string>());
                }
            }
        }

        var model = new InMemoryStateModel(namespaces);
        if (state is not null)
        {
            // DeepClone each seed value: a JsonNode can't be attached to two parents.
            var ops = new List<PatchOp>();
            foreach ((string ns, JsonNode? value) in state)
            {
                ops.Add(new PatchOp("set", ns, value?.DeepClone()));
            }

            model.Apply(ops);
        }

        return model;
    }

    /// <summary>Stand up a runtime for a bundle, exposing both the controller and its state model.</summary>
    public static BundleRuntime LoadRuntime(Bundle bundle)
    {
        InMemoryStateModel state = SeedState(bundle.Manifest, bundle.State);
        var kernel = new GenKernel(bundle.Manifest, bundle.Document, state, bundle.Effects);
        return new BundleRuntime(new GenUIController(kernel), state);
    }

    /// <summary>Stand up a runtime for a bundle and return its controller.</summary>
    public static GenUIController LoadBundle(Bundle bundle) => LoadRuntime(bundle).Controller;

    /// <summary>The "everything is JSON" entry point: turn a parsed-JSON bundle object into a runnable
    /// <see cref="Bundle"/>, attaching only the native effect orchestrator it needs. A system boundary,
    /// so a malformed bundle throws here instead of failing deep inside the kernel.</summary>
    public static Bundle FromJson(JsonObject json, IOrchestrator? effects = null)
    {
        if (json["manifest"] is not JsonObject manifest)
        {
            throw new ArgumentException("bundle: missing or invalid 'manifest' (expected a GUP manifest message).", nameof(json));
        }

        if (json["document"] is not JsonObject document)
        {
            throw new ArgumentException("bundle: missing or invalid 'document' (expected a GUP document message).", nameof(json));
        }

        Dictionary<string, JsonNode?>? state = null;
        if (json["state"] is JsonObject seed)
        {
            state = new Dictionary<string, JsonNode?>();
            foreach (KeyValuePair<string, JsonNode?> kv in seed)
            {
                state[kv.Key] = kv.Value?.DeepClone();
            }
        }
        else if (json["state"] is not null)
        {
            throw new ArgumentException("bundle: 'state' must be an object of namespace -> value.", nameof(json));
        }

        return new Bundle(manifest.DeepClone().AsObject(), document.DeepClone().AsObject(), state, effects);
    }
}
