// validate-before-commit. A hand-written structural check mirroring the essential
// invariants of schemas/document.schema.json (every node has capability + id; every
// action has a `do`). Not a general JSON Schema engine — kept dependency-free; extend
// here as the document schema grows.

using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public sealed class ValidationException(string message) : Exception(message);

public static class Validator
{
    public static void ValidateDocument(JsonObject message)
    {
        var payload = message["payload"] as JsonObject ?? message;
        if (payload["root"] is not JsonObject root)
            throw new ValidationException("Invalid GUP document: payload.root is required");

        ValidateNode(root);

        if (payload["machines"] is JsonArray machines)
            foreach (var m in machines)
                ValidateMachine(m as JsonObject ?? throw new ValidationException("Invalid GUP document: machine must be an object"));
    }

    private static void ValidateNode(JsonObject node)
    {
        if (node["capability"] is not JsonNode cap || cap.GetValueKind() != System.Text.Json.JsonValueKind.String)
            throw new ValidationException("Invalid GUP document: node.capability (string) is required");
        if (node["id"] is not JsonNode id || id.GetValueKind() != System.Text.Json.JsonValueKind.String)
            throw new ValidationException("Invalid GUP document: node.id (string) is required");

        var edges = node["edges"] as JsonObject;
        if (edges?["on"] is JsonObject on)
            foreach (var kv in on)
            {
                if (kv.Value is not JsonArray actions)
                    throw new ValidationException($"Invalid GUP document: edges.on.{kv.Key} must be an array");
                foreach (var a in actions) ValidateAction(a as JsonObject, kv.Key);
            }

        if (edges?["react"] is JsonArray react)
            foreach (var r in react)
            {
                if (r is not JsonObject reaction)
                    throw new ValidationException("Invalid GUP document: edges.react entry must be an object");
                if (reaction["when"] is not JsonNode w || w.GetValueKind() != System.Text.Json.JsonValueKind.String)
                    throw new ValidationException("Invalid GUP document: edges.react entry requires 'when' (string)");
                if (reaction["run"] is not JsonArray runActions)
                    throw new ValidationException("Invalid GUP document: edges.react entry requires 'run' (array)");
                foreach (var a in runActions) ValidateAction(a as JsonObject, "react");
            }

        if (edges?["children"] is JsonArray children)
            foreach (var child in children)
                ValidateNode(child as JsonObject ?? throw new ValidationException("Invalid GUP document: child must be an object"));
    }

    private static void ValidateMachine(JsonObject m)
    {
        if (m["states"] is not JsonObject states) return;
        foreach (var state in states)
            if (state.Value?["on"] is JsonObject on)
                foreach (var kv in on)
                    if (kv.Value is JsonObject transition && transition["actions"] is JsonArray actions)
                        foreach (var a in actions) ValidateAction(a as JsonObject, kv.Key);
    }

    private static void ValidateAction(JsonObject? action, string on)
    {
        if (action is null)
            throw new ValidationException($"Invalid GUP document: action under '{on}' must be an object");
        if (action["do"] is not JsonNode d || d.GetValueKind() != System.Text.Json.JsonValueKind.String)
            throw new ValidationException($"Invalid GUP document: action under '{on}' is missing required 'do'");
    }
}
