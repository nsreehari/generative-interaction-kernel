using System.Globalization;
using System.Text;

namespace GenUI.Jsonata;

/// <summary>
/// A JSONata array/sequence. JSONata distinguishes plain JSON arrays from internally-generated
/// "sequences" (the result of navigating a path). Both are modelled here by a single list type
/// carrying the sequence-related flags from the canonical implementation; <see cref="Sequence"/>
/// discriminates the two (false = plain array, true = sequence).
/// </summary>
public sealed class JArr : List<object?>
{
    public bool Sequence;
    public bool KeepSingleton;
    public bool Cons;
    public bool OuterWrapper;
    public bool TupleStream;

    public JArr() { }
    public JArr(IEnumerable<object?> items) : base(items) { }
}

/// <summary>
/// Value-model helpers mirroring the canonical utils. The C# value model is:
/// <c>null</c> (JSON null), <see cref="bool"/>, <see cref="double"/>, <see cref="string"/>,
/// <see cref="JArr"/> (array/sequence), <see cref="Dictionary{TKey,TValue}"/> (object),
/// and function values (<see cref="Lambda"/>, <see cref="NativeFunction"/>).
/// JSONata "undefined" (a missing value, distinct from JSON null) is represented by
/// the <see cref="Undefined"/> sentinel.
/// </summary>
public static class J
{
    /// <summary>Sentinel representing JSONata "undefined" (a missing value), distinct from JSON null.</summary>
    public static readonly object Undefined = new UndefinedSentinel();

    private sealed class UndefinedSentinel
    {
        public override string ToString() => "undefined";
    }

    public static bool IsUndef(object? x) => ReferenceEquals(x, Undefined);

    /// <summary>typeof x === 'number' &amp;&amp; isFinite. Throws D1001 for infinities like the canonical.</summary>
    public static bool IsNumeric(object? x)
    {
        if (x is double d)
        {
            if (double.IsNaN(d)) return false;
            if (double.IsInfinity(d))
            {
                throw new JsonataException("D1001");
            }
            return true;
        }
        return false;
    }

    public static bool IsSequence(object? x) => x is JArr j && j.Sequence;

    public static bool IsArray(object? x) => x is JArr;

    public static bool IsObject(object? x) => x is Dictionary<string, object?>;

    public static bool IsFunction(object? x) => x is Lambda || x is NativeFunction;

    public static bool IsLambda(object? x) => x is Lambda;

    public static bool IsArrayOfNumbers(object? x)
    {
        if (x is not JArr a) return false;
        foreach (var i in a) if (!IsNumeric(i)) return false;
        return true;
    }

    public static bool IsArrayOfStrings(object? x)
    {
        if (x is not JArr a) return false;
        foreach (var i in a) if (i is not string) return false;
        return true;
    }

    public static int FunctionArity(object? func) => func switch
    {
        Lambda l => l.Arguments.Count,
        NativeFunction n => n.Arity,
        _ => 0,
    };

    /// <summary>Deep structural equality, faithful port of canonical isDeepEqual.</summary>
    public static bool DeepEqual(object? lhs, object? rhs)
    {
        if (ReferenceEquals(lhs, rhs)) return true;
        if (lhs is null || rhs is null) return false;

        if (lhs is double dl && rhs is double dr) return dl == dr;
        if (lhs is string sl && rhs is string sr) return sl == sr;
        if (lhs is bool bl && rhs is bool br) return bl == br;

        if (lhs is JArr al && rhs is JArr ar)
        {
            if (al.Count != ar.Count) return false;
            for (int i = 0; i < al.Count; i++)
                if (!DeepEqual(al[i], ar[i])) return false;
            return true;
        }

        if (lhs is Dictionary<string, object?> ol && rhs is Dictionary<string, object?> or)
        {
            if (ol.Count != or.Count) return false;
            foreach (var kv in ol)
            {
                if (!or.TryGetValue(kv.Key, out var rv)) return false;
                if (!DeepEqual(kv.Value, rv)) return false;
            }
            return true;
        }

        return false;
    }

    /// <summary>Flatten nested arrays into a single flat list (canonical flatten).</summary>
    public static void Flatten(object? arg, List<object?> flattened)
    {
        if (arg is JArr a)
        {
            foreach (var item in a) Flatten(item, flattened);
        }
        else
        {
            flattened.Add(arg);
        }
    }

    /// <summary>Format a number the way JS String()/JSON.stringify would (integers without a decimal point).</summary>
    public static string NumStr(double d)
    {
        if (double.IsNaN(d)) return "NaN";
        if (double.IsPositiveInfinity(d)) return "Infinity";
        if (double.IsNegativeInfinity(d)) return "-Infinity";
        if (double.IsInteger(d) && Math.Abs(d) < 1e21)
        {
            // integers print without a fractional part; handle full 64-bit range via decimal path
            return d.ToString("0", CultureInfo.InvariantCulture);
        }
        // shortest round-trippable representation
        return d.ToString("R", CultureInfo.InvariantCulture);
    }
}

/// <summary>Minimal JSON reader/writer over the JSONata value model (System.Text.Json for parsing).</summary>
public static class Json
{
    public static object? FromElement(System.Text.Json.JsonElement el)
    {
        switch (el.ValueKind)
        {
            case System.Text.Json.JsonValueKind.Null:
            case System.Text.Json.JsonValueKind.Undefined:
                return null;
            case System.Text.Json.JsonValueKind.True:
                return true;
            case System.Text.Json.JsonValueKind.False:
                return false;
            case System.Text.Json.JsonValueKind.Number:
                return el.GetDouble();
            case System.Text.Json.JsonValueKind.String:
                return el.GetString();
            case System.Text.Json.JsonValueKind.Array:
                {
                    var arr = new JArr();
                    foreach (var item in el.EnumerateArray()) arr.Add(FromElement(item));
                    return arr;
                }
            case System.Text.Json.JsonValueKind.Object:
                {
                    var obj = new Dictionary<string, object?>();
                    foreach (var prop in el.EnumerateObject()) obj[prop.Name] = FromElement(prop.Value);
                    return obj;
                }
            default:
                return null;
        }
    }

    /// <summary>Serialize the value model to JSON text (JS JSON.stringify semantics; drops undefined/functions).</summary>
    public static string Stringify(object? value, int space = 0)
    {
        var sb = new StringBuilder();
        Write(sb, value, space, 0);
        return sb.ToString();
    }

    private static void Write(StringBuilder sb, object? value, int space, int depth)
    {
        switch (value)
        {
            case null:
                sb.Append("null");
                break;
            case bool b:
                sb.Append(b ? "true" : "false");
                break;
            case double d:
                sb.Append(J.NumStr(d));
                break;
            case string s:
                WriteString(sb, s);
                break;
            case JArr arr:
                {
                    sb.Append('[');
                    bool first = true;
                    foreach (var item in arr)
                    {
                        var v = J.IsUndef(item) || J.IsFunction(item) ? null : item;
                        if (!first) sb.Append(',');
                        first = false;
                        Newline(sb, space, depth + 1);
                        Write(sb, v, space, depth + 1);
                    }
                    if (!first) Newline(sb, space, depth);
                    sb.Append(']');
                    break;
                }
            case Dictionary<string, object?> obj:
                {
                    sb.Append('{');
                    bool first = true;
                    foreach (var kv in obj)
                    {
                        if (J.IsUndef(kv.Value)) continue;
                        if (!first) sb.Append(',');
                        first = false;
                        Newline(sb, space, depth + 1);
                        WriteString(sb, kv.Key);
                        sb.Append(space > 0 ? ": " : ":");
                        var v = J.IsFunction(kv.Value) ? "" : kv.Value;
                        Write(sb, v, space, depth + 1);
                    }
                    if (!first) Newline(sb, space, depth);
                    sb.Append('}');
                    break;
                }
            default:
                if (J.IsFunction(value)) { sb.Append("\"\""); }
                else sb.Append("null");
                break;
        }
    }

    private static void Newline(StringBuilder sb, int space, int depth)
    {
        if (space <= 0) return;
        sb.Append('\n');
        sb.Append(' ', space * depth);
    }

    private static void WriteString(StringBuilder sb, string s)
    {
        sb.Append('"');
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < ' ') sb.Append("\\u").Append(((int)ch).ToString("x4", CultureInfo.InvariantCulture));
                    else sb.Append(ch);
                    break;
            }
        }
        sb.Append('"');
    }
}
