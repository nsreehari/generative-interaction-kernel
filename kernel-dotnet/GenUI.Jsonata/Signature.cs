namespace GenUI.Jsonata;

/// <summary>
/// Placeholder for a parsed lambda signature (`function($x)&lt;s:s&gt;{...}`). Full signature
/// validation (canonical `signature.js`) is a later stage; no current corpus case declares a
/// signature. When a signature string is present the parser records it verbatim so behavior can be
/// wired up later without reparsing.
/// </summary>
public sealed class Signature
{
    public string Definition { get; }

    public Signature(string definition) => Definition = definition;

    /// <summary>Parse a signature string. Currently records it verbatim without validation.</summary>
    public static Signature Parse(string signature) => new(signature);
}
