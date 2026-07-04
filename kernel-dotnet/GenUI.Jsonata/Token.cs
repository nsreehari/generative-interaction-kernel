using System.Text.RegularExpressions;

namespace GenUI.Jsonata;

/// <summary>
/// A lexical token produced by <see cref="Tokenizer"/>. Mirrors the canonical token record
/// <c>{ type, value, position }</c> from jsonata.js.
/// </summary>
/// <remarks>
/// <see cref="Value"/> is boxed to match the canonical dynamic value:
/// <list type="bullet">
///   <item><c>"number"</c> → <see cref="double"/></item>
///   <item><c>"string"</c>, <c>"name"</c>, <c>"variable"</c>, <c>"operator"</c> → <see cref="string"/></item>
///   <item><c>"value"</c> → <see cref="bool"/> or <c>null</c> (for the literals true/false/null)</item>
///   <item><c>"regex"</c> → <see cref="Regex"/></item>
/// </list>
/// </remarks>
public sealed record Token(string Type, object? Value, int Position)
{
    /// <summary>Canonical token-type tags (the `type` field values used by jsonata.js).</summary>
    public static class Kind
    {
        public const string Operator = "operator";
        public const string String = "string";
        public const string Number = "number";
        public const string Name = "name";
        public const string Variable = "variable";
        public const string Value = "value";
        public const string Regex = "regex";
    }
}
