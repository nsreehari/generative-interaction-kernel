using System;
using System.Collections.Generic;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace GenUI.Render.Reactor;

public sealed record GenUIStagedFile(
    string Name,
    string ContentType,
    byte[] Bytes,
    long Size)
{
    public JsonObject ToMetadataJson() => new()
    {
        ["name"] = Name,
        ["contentType"] = ContentType,
        ["size"] = Size,
    };

    public IReadOnlyDictionary<string, object?> ToData() => new Dictionary<string, object?>(StringComparer.Ordinal)
    {
        ["name"] = Name,
        ["contentType"] = ContentType,
        ["size"] = Size,
        ["bytes"] = Bytes,
    };
}

public sealed record GenUIFileServices(
    Func<bool, IReadOnlyList<string>?, Task<IReadOnlyList<GenUIStagedFile>>>? PickAttachmentsAsync = null,
    Func<IReadOnlyList<IReadOnlyDictionary<string, object?>>, string?, Task>? UploadFilesMultiple = null,
    Func<int, JsonObject, string?>? ResolveFileUrl = null);