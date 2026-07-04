// A minimal, faithful evaluator for the JSONata subset the conformance matrix uses:
//   path navigation (card_data.selected), bound variables ($event.id),
//   integer literals, single-quoted strings, null/true/false,
//   multiplication (*), and equality / inequality (= , !=).
//
// This is the ExpressionProvider seam (the manifest declares "jsonata"); it is
// deliberately NOT a full JSONata engine. Semantics for the required forms match
// jsonata-js as observed through the runner contract (truthy() wraps the result,
// so absent paths — evaluated to null — read as falsy). If a future case introduces
// a richer expression, swap this for a full JSONata port behind the same interface.

using System.Text;
using System.Text.Json.Nodes;

namespace GenUI.Kernel;

public sealed class MiniJsonataProvider : IExpressionProvider
{
    public JsonNode? Eval(string expr, JsonObject data, IReadOnlyDictionary<string, JsonNode?>? bindings = null)
        => new Parser(Tokenize(expr), data, bindings ?? EmptyBindings).ParseEquality();

    private static readonly IReadOnlyDictionary<string, JsonNode?> EmptyBindings =
        new Dictionary<string, JsonNode?>();

    // ---- tokens ----------------------------------------------------------
    private enum Kind { Number, String, Ident, Dollar, Dot, Star, Eq, Neq, End }

    private readonly record struct Token(Kind Kind, string Text = "", double Number = 0);

    private static List<Token> Tokenize(string s)
    {
        var tokens = new List<Token>();
        var i = 0;
        while (i < s.Length)
        {
            var ch = s[i];
            if (char.IsWhiteSpace(ch)) { i++; continue; }

            switch (ch)
            {
                case '$': tokens.Add(new Token(Kind.Dollar)); i++; continue;
                case '.': tokens.Add(new Token(Kind.Dot)); i++; continue;
                case '*': tokens.Add(new Token(Kind.Star)); i++; continue;
                case '=': tokens.Add(new Token(Kind.Eq)); i++; continue;
                case '!':
                    if (i + 1 < s.Length && s[i + 1] == '=') { tokens.Add(new Token(Kind.Neq)); i += 2; continue; }
                    throw new FormatException($"unexpected '!' in expression: {s}");
                case '\'':
                {
                    var sb = new StringBuilder();
                    i++;
                    while (i < s.Length && s[i] != '\'') sb.Append(s[i++]);
                    if (i >= s.Length) throw new FormatException($"unterminated string in: {s}");
                    i++; // closing quote
                    tokens.Add(new Token(Kind.String, sb.ToString()));
                    continue;
                }
            }

            if (char.IsDigit(ch))
            {
                var start = i;
                while (i < s.Length && char.IsDigit(s[i])) i++;
                tokens.Add(new Token(Kind.Number, Number: double.Parse(s[start..i])));
                continue;
            }

            if (char.IsLetter(ch) || ch == '_')
            {
                var start = i;
                while (i < s.Length && (char.IsLetterOrDigit(s[i]) || s[i] == '_')) i++;
                tokens.Add(new Token(Kind.Ident, s[start..i]));
                continue;
            }

            throw new FormatException($"unexpected character '{ch}' in expression: {s}");
        }
        tokens.Add(new Token(Kind.End));
        return tokens;
    }

    // ---- recursive-descent evaluator -------------------------------------
    private sealed class Parser(List<Token> tokens, JsonObject data, IReadOnlyDictionary<string, JsonNode?> bindings)
    {
        private int _pos;
        private Token Peek => tokens[_pos];
        private Token Next() => tokens[_pos++];

        public JsonNode? ParseEquality()
        {
            var left = ParseMultiplicative();
            while (Peek.Kind is Kind.Eq or Kind.Neq)
            {
                var op = Next().Kind;
                var right = ParseMultiplicative();
                var equal = Json.DeepEquals(left, right);
                left = JsonValue.Create(op == Kind.Eq ? equal : !equal);
            }
            return left;
        }

        private JsonNode? ParseMultiplicative()
        {
            var left = ParsePrimary();
            while (Peek.Kind == Kind.Star)
            {
                Next();
                var right = ParsePrimary();
                left = (AsNumber(left), AsNumber(right)) switch
                {
                    ({ } a, { } b) => JsonValue.Create(a * b),
                    _ => null,
                };
            }
            return left;
        }

        private JsonNode? ParsePrimary()
        {
            var t = Next();
            switch (t.Kind)
            {
                case Kind.Number:
                    return JsonValue.Create(t.Number);
                case Kind.String:
                    return JsonValue.Create(t.Text);
                case Kind.Ident:
                    return t.Text switch
                    {
                        "null" => null,
                        "true" => JsonValue.Create(true),
                        "false" => JsonValue.Create(false),
                        _ => Navigate(data, ReadPath(t.Text)),
                    };
                case Kind.Dollar:
                {
                    var name = Expect(Kind.Ident).Text;
                    var parts = ReadPath(null);
                    bindings.TryGetValue(name, out var start);
                    return Navigate(start, parts);
                }
                default:
                    throw new FormatException($"unexpected token {t.Kind} in expression");
            }
        }

        // Collect a dotted path. `first` seeds the list (an already-consumed leading ident);
        // pass null to start empty (used after $var).
        private List<string> ReadPath(string? first)
        {
            var parts = new List<string>();
            if (first is not null) parts.Add(first);
            while (Peek.Kind == Kind.Dot)
            {
                Next();
                parts.Add(Expect(Kind.Ident).Text);
            }
            return parts;
        }

        private Token Expect(Kind kind)
        {
            if (Peek.Kind != kind) throw new FormatException($"expected {kind}, got {Peek.Kind}");
            return Next();
        }

        private static JsonNode? Navigate(JsonNode? start, IReadOnlyList<string> parts)
        {
            var cur = start;
            foreach (var p in parts)
                cur = cur is JsonObject o && o.TryGetPropertyValue(p, out var next) ? next : null;
            return cur?.DeepClone();
        }

        private static double? AsNumber(JsonNode? n) =>
            n is not null && n.GetValueKind() == System.Text.Json.JsonValueKind.Number ? n.GetValue<double>() : null;
    }
}
