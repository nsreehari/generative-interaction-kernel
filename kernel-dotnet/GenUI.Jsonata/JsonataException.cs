namespace GenUI.Jsonata;

/// <summary>
/// Error raised by the JSONata engine. Mirrors the canonical implementation, which throws plain
/// objects of shape <c>{ code, position, token? }</c> (see jsonata.js). The <see cref="Code"/>
/// values (e.g. "S0101", "S0201") are the canonical error codes and are kept verbatim so behavior
/// can be compared against the reference engine.
/// </summary>
public sealed class JsonataException : Exception
{
    /// <summary>Canonical JSONata error code, e.g. "S0101".</summary>
    public string Code { get; }

    /// <summary>Character offset in the source expression where the error was detected.</summary>
    public int Position { get; }

    /// <summary>Offending token/character, when the canonical error carries one.</summary>
    public string? Token { get; }

    public JsonataException(string code, int position, string? token = null)
        : base($"{code} (position {position}){(token is null ? "" : $": {token}")}")
    {
        Code = code;
        Position = position;
        Token = token;
    }
}
