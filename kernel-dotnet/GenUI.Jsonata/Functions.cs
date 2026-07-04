using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace GenUI.Jsonata;

/// <summary>
/// The JSONata built-in function library, ported from the canonical <c>fn.*</c> implementations.
/// Signature validation and locale/datetime features are out of scope for this port; the functions
/// exercised by the conformance corpus are implemented faithfully (including the string-argument
/// paths of <c>$contains</c>/<c>$replace</c>/<c>$split</c>).
/// </summary>
public static class Functions
{
    private static readonly object Undef = J.Undefined;

    private static object? Arg(object?[] a, int i) => i < a.Length ? a[i] : Undef;

    // ---- aggregation ---------------------------------------------------------

    public static object? Sum(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        double total = 0;
        foreach (var n in arr) total += ToNum(n);
        return total;
    }

    public static object? Count(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return 0.0;
        return (double)AsArray(arg).Count;
    }

    public static object? Max(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        if (arr.Count == 0) return Undef;
        double m = double.NegativeInfinity;
        foreach (var n in arr) m = Math.Max(m, ToNum(n));
        return m;
    }

    public static object? Min(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        if (arr.Count == 0) return Undef;
        double m = double.PositiveInfinity;
        foreach (var n in arr) m = Math.Min(m, ToNum(n));
        return m;
    }

    public static object? Average(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        if (arr.Count == 0) return Undef;
        double total = 0;
        foreach (var n in arr) total += ToNum(n);
        return total / arr.Count;
    }

    // ---- strings -------------------------------------------------------------

    public static object? String(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        bool prettify = a.Length > 1 && a[1] is bool b && b;
        return StrValue(arg, prettify);
    }

    /// <summary>Convert a value to its JSONata string representation (used by <c>&amp;</c> and <c>$string</c>).</summary>
    public static string StrValue(object? arg, bool prettify = false)
    {
        if (arg is string s) return s;
        if (J.IsFunction(arg)) return "";
        if (arg is double d && double.IsInfinity(d))
            throw new JsonataException("D3001") { Value = arg };
        return Json.Stringify(arg, prettify ? 2 : 0);
    }

    public static object? Substring(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        int start = (int)ToNum(a[1]);
        int strLength = str.Length;
        if (strLength + start < 0) start = 0;

        if (a.Length > 2 && !J.IsUndef(a[2]))
        {
            int length = (int)ToNum(a[2]);
            if (length <= 0) return "";
            int end = start >= 0 ? start + length : strLength + start + length;
            return SliceString(str, start, end);
        }
        return SliceString(str, start, null);
    }

    public static object? SubstringBefore(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        string chars = (string)a[1]!;
        int pos = str.IndexOf(chars, StringComparison.Ordinal);
        return pos > -1 ? str.Substring(0, pos) : str;
    }

    public static object? SubstringAfter(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        string chars = (string)a[1]!;
        int pos = str.IndexOf(chars, StringComparison.Ordinal);
        return pos > -1 ? str.Substring(pos + chars.Length) : str;
    }

    public static object? Lowercase(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return ((string)arg!).ToLowerInvariant();
    }

    public static object? Uppercase(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return ((string)arg!).ToUpperInvariant();
    }

    public static object? Length(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return (double)((string)arg!).Length;
    }

    public static object? Trim(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        var sb = new StringBuilder(str.Length);
        bool inSpace = false;
        foreach (var ch in str)
        {
            if (ch is ' ' or '\t' or '\n' or '\r')
            {
                inSpace = true;
            }
            else
            {
                if (inSpace && sb.Length > 0) sb.Append(' ');
                inSpace = false;
                sb.Append(ch);
            }
        }
        return sb.ToString();
    }

    public static object? Pad(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        int width = (int)Math.Truncate(ToNum(a[1]));
        string ch = a.Length > 2 && a[2] is string cs && cs.Length > 0 ? cs : " ";

        int padLength = Math.Abs(width) - str.Length;
        if (padLength <= 0) return str;

        var padding = new StringBuilder();
        while (padding.Length < padLength) padding.Append(ch);
        string pad = padding.ToString();
        if (pad.Length > padLength) pad = pad.Substring(0, padLength);
        return width > 0 ? str + pad : pad + str;
    }

    public static object? Contains(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        object? token = a[1];
        if (token is string ts) return str.IndexOf(ts, StringComparison.Ordinal) != -1;
        if (J.IsFunction(token))
        {
            var matches = InvokeMatcher(f, token, str);
            return !J.IsUndef(matches);
        }
        throw new JsonataException("T0410") { Value = token };
    }

    public static object? Match(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        object? regex = a[1];
        double? limit = null;
        if (a.Length > 2 && !J.IsUndef(a[2]))
        {
            limit = ToNum(a[2]);
            if (limit < 0) throw new JsonataException("D3040") { Value = limit };
        }

        var result = f.NewSequence();
        if (limit is null || limit > 0)
        {
            int count = 0;
            var matches = InvokeMatcher(f, regex, str);
            while (matches is Dictionary<string, object?> md && (limit is null || count < limit))
            {
                result.Add(new Dictionary<string, object?>
                {
                    ["match"] = md["match"],
                    ["index"] = md["start"],
                    ["groups"] = md["groups"],
                });
                matches = InvokeNext(f, md["next"]);
                count++;
            }
        }
        return result;
    }

    public static object? Replace(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        object? pattern = a[1];
        object? replacement = a.Length > 2 ? a[2] : "";
        int? limit = a.Length > 3 && !J.IsUndef(a[3]) ? (int)ToNum(a[3]) : null;

        if (pattern is string ps)
        {
            if (ps.Length == 0) throw new JsonataException("D3010") { Value = pattern };
            if (limit is < 0) throw new JsonataException("D3011") { Value = limit };
            string rep = replacement as string ?? "";
            if (limit is 0) return str;

            var result = new StringBuilder();
            int position = 0, count = 0;
            int index = str.IndexOf(ps, position, StringComparison.Ordinal);
            while (index != -1 && (limit is null || count < limit))
            {
                result.Append(str, position, index - position);
                result.Append(rep);
                position = index + ps.Length;
                count++;
                index = position <= str.Length ? str.IndexOf(ps, position, StringComparison.Ordinal) : -1;
            }
            result.Append(str, position, str.Length - position);
            return result.ToString();
        }

        if (J.IsFunction(pattern))
        {
            if (limit is < 0) throw new JsonataException("D3011") { Value = limit };
            if (limit is 0) return str;

            var result = new StringBuilder();
            int position = 0, count = 0;
            var matches = InvokeMatcher(f, pattern, str);
            if (J.IsUndef(matches)) return str;
            while (matches is Dictionary<string, object?> md && (limit is null || count < limit))
            {
                int start = (int)(double)md["start"]!;
                string matchStr = (string)md["match"]!;
                result.Append(str, position, start - position);
                object? replacedWith = replacement is string rstr
                    ? ExpandReplacement(rstr, md)
                    : f.Engine.Apply(replacement, new object?[] { md }, f.Input, f.Environment);
                if (replacedWith is not string rw) throw new JsonataException("D3012") { Value = replacedWith };
                result.Append(rw);
                position = start + matchStr.Length;
                count++;
                matches = InvokeNext(f, md["next"]);
            }
            result.Append(str, position, str.Length - position);
            return result.ToString();
        }

        throw new JsonataException("T0410") { Value = pattern };
    }

    public static object? Split(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        string str = (string)arg!;
        object? separator = a[1];
        int? limit = a.Length > 2 && !J.IsUndef(a[2]) ? (int)ToNum(a[2]) : null;
        if (limit is < 0) throw new JsonataException("D3020") { Value = limit };

        var result = new JArr();
        if (limit is 0) return result;

        if (separator is string sep)
        {
            IEnumerable<string> parts;
            if (sep.Length == 0)
            {
                parts = str.Select(c => c.ToString());
            }
            else
            {
                parts = str.Split(new[] { sep }, StringSplitOptions.None);
            }
            foreach (var p in parts)
            {
                if (limit is int lim && result.Count >= lim) break;
                result.Add(p);
            }
            return result;
        }

        if (J.IsFunction(separator))
        {
            int count = 0;
            var matches = InvokeMatcher(f, separator, str);
            if (J.IsUndef(matches)) { result.Add(str); return result; }
            int start = 0;
            while (matches is Dictionary<string, object?> md && (limit is null || count < limit))
            {
                int mstart = (int)(double)md["start"]!;
                result.Add(str.Substring(start, mstart - start));
                start = (int)(double)md["end"]!;
                matches = InvokeNext(f, md["next"]);
                count++;
            }
            if (limit is null || count < limit) result.Add(str.Substring(start));
            return result;
        }

        throw new JsonataException("T0410") { Value = separator };
    }

    /// <summary>
    /// Builds the matcher closure for a regex literal, mirroring the canonical <c>evaluateRegex</c>.
    /// The returned native function accepts <c>(str[, fromIndex])</c> and returns a match record
    /// <c>{match,start,end,groups,next}</c> (or undefined when no match), where <c>next</c> is itself
    /// a native function that advances to the following match (throwing D1004 on zero-width loops).
    /// </summary>
    public static NativeFunction MakeRegexMatcher(Regex re, int position)
    {
        Func<string, int, object?> closure = null!;
        closure = (str, fromIndex) =>
        {
            int start = fromIndex < 0 ? 0 : fromIndex;
            if (start > str.Length) return Undef;
            var m = re.Match(str, start);
            if (!m.Success) return Undef;

            var groups = new JArr();
            for (int i = 1; i < m.Groups.Count; i++)
            {
                var g = m.Groups[i];
                groups.Add(g.Success ? g.Value : Undef);
            }
            int end = m.Index + m.Value.Length;
            var record = new Dictionary<string, object?>
            {
                ["match"] = m.Value,
                ["start"] = (double)m.Index,
                ["end"] = (double)end,
                ["groups"] = groups,
            };
            record["next"] = new NativeFunction("", 0, (_, _) =>
            {
                if (end >= str.Length) return Undef;
                var next = closure(str, end);
                if (next is Dictionary<string, object?> nd && (string)nd["match"]! == string.Empty)
                    throw new JsonataException("D1004") { Value = re.ToString() };
                return next;
            });
            return record;
        };
        return new NativeFunction("", 1, (_, args) =>
        {
            string s = (string)args[0]!;
            int fromIndex = args.Length > 1 && args[1] is double d ? (int)d : 0;
            return closure(s, fromIndex);
        });
    }

    private static object? InvokeMatcher(Focus f, object? matcher, string str)
    {
        var result = f.Engine.Apply(matcher, new object?[] { str }, f.Input, f.Environment);
        if (!J.IsUndef(result) && result is not Dictionary<string, object?>)
            throw new JsonataException("T1010");
        return result;
    }

    private static object? InvokeNext(Focus f, object? nextFn)
    {
        return f.Engine.Apply(nextFn, Array.Empty<object?>(), f.Input, f.Environment);
    }

    /// <summary>
    /// Expands a string replacement against a match record, honoring <c>$0</c> (whole match),
    /// <c>$n</c> (capture group n), and <c>$$</c> (literal <c>$</c>) — a faithful port of the
    /// canonical <c>replace</c> replacer.
    /// </summary>
    private static string ExpandReplacement(string replacement, Dictionary<string, object?> md)
    {
        var groups = (JArr)md["groups"]!;
        var substitute = new StringBuilder();
        int position = 0;
        int index = replacement.IndexOf('$', position);
        while (index != -1 && position < replacement.Length)
        {
            substitute.Append(replacement, position, index - position);
            position = index + 1;
            char dollarVal = position < replacement.Length ? replacement[position] : '\0';
            if (dollarVal == '$')
            {
                substitute.Append('$');
                position++;
            }
            else if (dollarVal == '0')
            {
                substitute.Append((string)md["match"]!);
                position++;
            }
            else
            {
                int maxDigits = groups.Count == 0
                    ? 1
                    : (int)Math.Floor(Math.Log(groups.Count) * 0.4342944819032518) + 1;
                int grpIndex = ParseLeadingInt(replacement, position, maxDigits);
                if (maxDigits > 1 && grpIndex > groups.Count)
                    grpIndex = ParseLeadingInt(replacement, position, maxDigits - 1);
                if (grpIndex != int.MinValue)
                {
                    if (groups.Count > 0)
                    {
                        var submatch = grpIndex - 1 >= 0 && grpIndex - 1 < groups.Count ? groups[grpIndex - 1] : Undef;
                        if (!J.IsUndef(submatch)) substitute.Append((string)submatch!);
                    }
                    position += grpIndex.ToString(CultureInfo.InvariantCulture).Length;
                }
                else
                {
                    substitute.Append('$');
                }
            }
            index = replacement.IndexOf('$', position);
        }
        substitute.Append(replacement, position, replacement.Length - position);
        return substitute.ToString();
    }

    private static int ParseLeadingInt(string s, int start, int maxDigits)
    {
        int end = start;
        while (end < s.Length && end - start < maxDigits && s[end] >= '0' && s[end] <= '9') end++;
        if (end == start) return int.MinValue;
        return int.Parse(s.AsSpan(start, end - start), NumberStyles.Integer, CultureInfo.InvariantCulture);
    }

    public static object? Join(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        string separator = a.Length > 1 && a[1] is string s ? s : "";
        return string.Join(separator, arr.Select(x => (string)x!));
    }

    // ---- numeric -------------------------------------------------------------

    public static object? Number(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        if (arg is double d) return d;
        if (arg is bool b) return b ? 1.0 : 0.0;
        if (arg is string s)
        {
            if (Regex.IsMatch(s, "^-?[0-9]+(\\.[0-9]+)?([Ee][-+]?[0-9]+)?$")
                && double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                && !double.IsInfinity(parsed))
                return parsed;
            if (Regex.IsMatch(s, "^0[xX][0-9A-Fa-f]+$")) return (double)Convert.ToInt64(s.Substring(2), 16);
            if (Regex.IsMatch(s, "^0[oO][0-7]+$")) return (double)Convert.ToInt64(s.Substring(2), 8);
            if (Regex.IsMatch(s, "^0[bB][01]+$")) return (double)Convert.ToInt64(s.Substring(2), 2);
        }
        throw new JsonataException("D3030") { Value = arg };
    }

    public static object? Abs(Focus f, object?[] a) => Num1(a, Math.Abs);
    public static object? Floor(Focus f, object?[] a) => Num1(a, Math.Floor);
    public static object? Ceil(Focus f, object?[] a) => Num1(a, Math.Ceiling);

    public static object? Sqrt(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        double d = ToNum(arg);
        if (d < 0) throw new JsonataException("D3060") { Value = arg };
        return Math.Sqrt(d);
    }

    public static object? Power(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        double result = Math.Pow(ToNum(arg), ToNum(a[1]));
        if (double.IsInfinity(result) || double.IsNaN(result))
            throw new JsonataException("D3061") { Value = arg };
        return result;
    }

    public static object? Round(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        double value = ToNum(arg);
        int precision = a.Length > 1 && !J.IsUndef(a[1]) ? (int)ToNum(a[1]) : 0;
        // banker's rounding (round half to even), matching the canonical algorithm
        double result = Math.Round(value, Math.Max(0, precision), MidpointRounding.ToEven);
        if (precision < 0)
        {
            double factor = Math.Pow(10, -precision);
            result = Math.Round(value / factor, MidpointRounding.ToEven) * factor;
        }
        if (result == 0) result = 0; // normalize -0
        return result;
    }

    public static object? Boolean(Focus f, object?[] a) => BoolValue(Arg(a, 0));

    public static object? Not(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return !Boolize(arg);
    }

    /// <summary>The effective boolean value (canonical <c>fn.boolean</c>). Returns Undefined for undefined input.</summary>
    public static object? BoolValue(object? arg)
    {
        if (J.IsUndef(arg)) return Undef;
        if (arg is JArr arr)
        {
            if (arr.Count == 1) return BoolValue(arr[0]);
            if (arr.Count > 1) return arr.Any(Boolize);
            return false;
        }
        if (arg is string s) return s.Length > 0;
        if (arg is double d) return d != 0;
        if (arg is bool b) return b;
        if (arg is Dictionary<string, object?> obj) return obj.Count > 0;
        return false;
    }

    /// <summary>Coerce to a plain bool (Undefined -&gt; false), for use in control flow.</summary>
    public static bool Boolize(object? v) => BoolValue(v) is bool b && b;

    // ---- arrays / objects ----------------------------------------------------

    public static object? Keys(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        var result = f.NewSequence();
        if (arg is JArr arr)
        {
            var seen = new List<string>();
            var merge = new HashSet<string>();
            foreach (var item in arr)
            {
                if (item is Dictionary<string, object?> o)
                {
                    foreach (var k in o.Keys)
                        if (merge.Add(k)) seen.Add(k);
                }
            }
            foreach (var k in seen) result.Add(k);
        }
        else if (arg is Dictionary<string, object?> obj)
        {
            foreach (var k in obj.Keys) result.Add(k);
        }
        return result;
    }

    public static object? Lookup(Focus f, object?[] a) => LookupValue(f, Arg(a, 0), (string)a[1]!);

    public static object? LookupValue(Focus f, object? input, string key)
    {
        if (input is JArr arr)
        {
            var result = f.NewSequence();
            foreach (var item in arr)
            {
                var res = LookupValue(f, item, key);
                if (!J.IsUndef(res))
                {
                    if (res is JArr ra) result.AddRange(ra);
                    else result.Add(res);
                }
            }
            return result;
        }
        if (input is Dictionary<string, object?> obj && obj.TryGetValue(key, out var value))
        {
            return value;
        }
        return Undef;
    }

    public static object? Append(Focus f, object?[] a) => AppendValue(f, Arg(a, 0), Arg(a, 1));

    public static object? AppendValue(Focus f, object? arg1, object? arg2)
    {
        if (J.IsUndef(arg1)) return arg2;
        if (J.IsUndef(arg2)) return arg1;
        var l1 = arg1 is JArr a1 ? (IEnumerable<object?>)a1 : new JArr { arg1 };
        var l2 = arg2 is JArr a2 ? (IEnumerable<object?>)a2 : new JArr { arg2 };
        var result = new JArr();
        result.AddRange(l1);
        result.AddRange(l2);
        return result;
    }

    public static object? Exists(Focus f, object?[] a) => !J.IsUndef(Arg(a, 0));

    public static object? Reverse(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        if (arr.Count <= 1) return arr;
        var result = new JArr(arr);
        result.Reverse();
        return result;
    }

    public static object? Distinct(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        if (arg is not JArr arr || arr.Count <= 1) return arg;
        var results = new JArr { Sequence = J.IsSequence(arr) };
        foreach (var value in arr)
        {
            if (!results.Any(r => J.DeepEqual(value, r))) results.Add(value);
        }
        return results;
    }

    public static object? Type(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return arg switch
        {
            null => "null",
            double => "number",
            string => "string",
            bool => "boolean",
            JArr => "array",
            _ when J.IsFunction(arg) => "function",
            _ => "object",
        };
    }

    // ---- higher-order --------------------------------------------------------

    public static object? Map(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        object? func = a[1];
        var result = f.NewSequence();
        for (int i = 0; i < arr.Count; i++)
        {
            var res = f.Engine.Apply(func, HofArgs(func, arr[i], i, arr), f.Input, f.Environment);
            if (!J.IsUndef(res)) result.Add(res);
        }
        return result;
    }

    public static object? Filter(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        object? func = a[1];
        var result = f.NewSequence();
        for (int i = 0; i < arr.Count; i++)
        {
            var res = f.Engine.Apply(func, HofArgs(func, arr[i], i, arr), f.Input, f.Environment);
            if (Boolize(res)) result.Add(arr[i]);
        }
        return result;
    }

    public static object? FoldLeft(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        object? func = a[1];
        int arity = J.FunctionArity(func);
        if (arity < 2) throw new JsonataException("D3050");

        object? result;
        int index;
        object? init = a.Length > 2 ? a[2] : Undef;
        if (J.IsUndef(init) && arr.Count > 0)
        {
            result = arr[0];
            index = 1;
        }
        else
        {
            result = init;
            index = 0;
        }

        while (index < arr.Count)
        {
            var args = new List<object?> { result, arr[index] };
            if (arity >= 3) args.Add((double)index);
            if (arity >= 4) args.Add(arr);
            result = f.Engine.Apply(func, args.ToArray(), f.Input, f.Environment);
            index++;
        }
        return result;
    }

    public static object? Sort(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        if (arr.Count <= 1) return arr;

        object? comparator = a.Length > 1 && !J.IsUndef(a[1]) ? a[1] : null;
        Func<object?, object?, bool> comp;
        if (comparator is null)
        {
            if (!J.IsArrayOfNumbers(arr) && !J.IsArrayOfStrings(arr))
                throw new JsonataException("D3070");
            comp = (x, y) => Compare(x, y) > 0;
        }
        else
        {
            comp = (x, y) => Boolize(f.Engine.Apply(comparator, new[] { x, y }, f.Input, f.Environment));
        }
        return MergeSort(arr, comp);
    }

    /// <summary>Stable merge sort used both by <c>$sort</c> and the <c>^(...)</c> order-by operator.</summary>
    public static JArr MergeSort(IReadOnlyList<object?> arr, Func<object?, object?, bool> comp)
    {
        List<object?> Msort(List<object?> array)
        {
            if (array.Count <= 1) return array;
            int middle = array.Count / 2;
            var left = Msort(array.GetRange(0, middle));
            var right = Msort(array.GetRange(middle, array.Count - middle));
            return Merge(left, right);
        }

        List<object?> Merge(List<object?> left, List<object?> right)
        {
            var merged = new List<object?>();
            int i = 0, j = 0;
            while (i < left.Count && j < right.Count)
            {
                if (comp(left[i], right[j])) merged.Add(right[j++]);
                else merged.Add(left[i++]);
            }
            while (i < left.Count) merged.Add(left[i++]);
            while (j < right.Count) merged.Add(right[j++]);
            return merged;
        }

        return new JArr(Msort(new List<object?>(arr)));
    }

    // ---- extended library (single/sift/zip/spread/merge/each/error/assert/clone,
    //      encoding, radix, non-deterministic, and ISO date/time) ----------------

    public static object? Single(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        object? func = a.Length > 1 && !J.IsUndef(a[1]) ? a[1] : null;
        bool found = false;
        object? result = Undef;
        for (int i = 0; i < arr.Count; i++)
        {
            bool positive = true;
            if (func != null)
            {
                var res = f.Engine.Apply(func, HofArgs(func, arr[i], i, arr), f.Input, f.Environment);
                positive = Boolize(res);
            }
            if (positive)
            {
                if (!found) { result = arr[i]; found = true; }
                else throw new JsonataException("D3138");
            }
        }
        if (!found) throw new JsonataException("D3139");
        return result;
    }

    public static object? Sift(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (arg is not Dictionary<string, object?> obj) return Undef;
        object? func = a[1];
        var result = new Dictionary<string, object?>();
        foreach (var kv in obj)
        {
            var res = f.Engine.Apply(func, HofArgsKV(func, kv.Value, kv.Key, obj), f.Input, f.Environment);
            if (Boolize(res)) result[kv.Key] = kv.Value;
        }
        return result.Count == 0 ? Undef : result;
    }

    public static object? Each(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (arg is not Dictionary<string, object?> obj) return Undef;
        object? func = a[1];
        var result = f.NewSequence();
        foreach (var kv in obj)
        {
            var val = f.Engine.Apply(func, HofArgsKV(func, kv.Value, kv.Key, obj), f.Input, f.Environment);
            if (!J.IsUndef(val)) result.Add(val);
        }
        return result;
    }

    public static object? Zip(Focus f, object?[] a)
    {
        int length = a.Length == 0 ? 0 : int.MaxValue;
        foreach (var x in a) length = Math.Min(length, x is JArr ja ? ja.Count : 0);
        var result = new JArr();
        for (int i = 0; i < length; i++)
        {
            var tuple = new JArr();
            foreach (var x in a) tuple.Add(x is JArr ja ? ja[i] : x);
            result.Add(tuple);
        }
        return result;
    }

    public static object? Spread(Focus f, object?[] a) => SpreadValue(f, Arg(a, 0));

    private static object? SpreadValue(Focus f, object? arg)
    {
        if (arg is JArr arr)
        {
            object? acc = f.NewSequence();
            foreach (var item in arr) acc = AppendValue(f, acc, SpreadValue(f, item));
            return acc;
        }
        if (arg is Dictionary<string, object?> obj && !J.IsLambda(arg))
        {
            var result = f.NewSequence();
            foreach (var kv in obj)
                result.Add(new Dictionary<string, object?> { [kv.Key] = kv.Value });
            return result;
        }
        return arg;
    }

    public static object? Merge(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        var result = new Dictionary<string, object?>();
        foreach (var item in arr)
            if (item is Dictionary<string, object?> obj)
                foreach (var kv in obj) result[kv.Key] = kv.Value;
        return result;
    }

    public static object? Error(Focus f, object?[] a)
    {
        var msg = Arg(a, 0);
        throw new JsonataException("D3137") { Value = J.IsUndef(msg) ? "$error() function evaluated" : msg };
    }

    public static object? Assert(Focus f, object?[] a)
    {
        var cond = Arg(a, 0);
        if (!Boolize(cond))
            throw new JsonataException("D3141") { Value = a.Length > 1 && !J.IsUndef(a[1]) ? a[1] : "$assert() statement failed" };
        return Undef;
    }

    public static object? Clone(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        using var doc = System.Text.Json.JsonDocument.Parse(Json.Stringify(arg, 0));
        return Json.FromElement(doc.RootElement);
    }

    public static object? Eval(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        object? input = f.Input;
        if (a.Length > 1 && !J.IsUndef(a[1]))
        {
            input = a[1];
            if (input is JArr ja && !ja.Sequence)
                input = new JArr(ja) { Sequence = true, OuterWrapper = true };
        }
        Ast ast;
        try { ast = Parser.Parse((string)arg!); }
        catch (Exception err) { throw new JsonataException("D3120") { Value = err.Message }; }
        try { return f.Engine.Evaluate(ast, input, f.Environment); }
        catch (JsonataException) { throw; }
        catch (Exception err) { throw new JsonataException("D3121") { Value = err.Message }; }
    }

    // ---- encoding ------------------------------------------------------------

    public static object? Base64Encode(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return Convert.ToBase64String(Encoding.Latin1.GetBytes((string)arg!));
    }

    public static object? Base64Decode(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return Encoding.Latin1.GetString(Convert.FromBase64String((string)arg!));
    }

    // JS encodeURIComponent / encodeURI unreserved character sets.
    private const string UriComponentSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()";
    private const string UriReserved = ";,/?:@&=+$#";

    public static object? EncodeUrlComponent(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return PercentEncode((string)arg!, UriComponentSafe);
    }

    public static object? EncodeUrl(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return PercentEncode((string)arg!, UriComponentSafe + UriReserved);
    }

    public static object? DecodeUrlComponent(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return PercentDecode((string)arg!, null);
    }

    public static object? DecodeUrl(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        // decodeURI leaves escape sequences of reserved characters intact
        return PercentDecode((string)arg!, UriReserved);
    }

    // ---- radix ---------------------------------------------------------------

    public static object? FormatBase(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        long value = (long)Math.Round(ToNum(arg), MidpointRounding.ToEven);
        int radix = a.Length > 1 && !J.IsUndef(a[1]) ? (int)Math.Round(ToNum(a[1]), MidpointRounding.ToEven) : 10;
        if (radix < 2 || radix > 36) throw new JsonataException("D3100") { Value = (double)radix };
        return NumberToRadix(value, radix);
    }

    // ---- non-deterministic ---------------------------------------------------

    private static readonly Random Rng = new();

    public static object? Random(Focus f, object?[] a) => Rng.NextDouble();

    public static object? Shuffle(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        var arr = AsArray(arg);
        if (arr.Count <= 1) return arr;
        var result = new object?[arr.Count];
        for (int i = 0; i < arr.Count; i++)
        {
            int j = Rng.Next(i + 1);
            if (i != j) result[i] = result[j];
            result[j] = arr[i];
        }
        return new JArr(result);
    }

    // ---- date / time (ISO 8601 default; picture strings out of scope) --------

    public static object? Now(Focus f, object?[] a)
    {
        if (a.Length > 0 && !J.IsUndef(a[0]))
            throw new JsonataException("U1202") { Value = "$now picture/timezone formatting is not supported by the platform JSONata engine" };
        return FromMillisValue(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    public static object? Millis(Focus f, object?[] a) => (double)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    public static object? FromMillis(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        if (a.Length > 1 && !J.IsUndef(a[1]))
            throw new JsonataException("U1202") { Value = "$fromMillis picture/timezone formatting is not supported by the platform JSONata engine" };
        return FromMillisValue((long)ToNum(arg));
    }

    public static object? ToMillis(Focus f, object?[] a)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        if (a.Length > 1 && !J.IsUndef(a[1]))
            throw new JsonataException("U1202") { Value = "$toMillis picture-string parsing is not supported by the platform JSONata engine" };
        var dto = DateTimeOffset.Parse((string)arg!, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
        return (double)dto.ToUnixTimeMilliseconds();
    }

    private static string FromMillisValue(long millis) =>
        DateTimeOffset.FromUnixTimeMilliseconds(millis).UtcDateTime
            .ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);

    // ---- explicitly-scoped-out (see ADR-0027) --------------------------------
    // The XPath 3.1 F&O locale-formatting layer is deliberately not ported for the platform-internal
    // engine. These stubs fail loudly so a caller learns it is an intentional scope decision rather
    // than a silent wrong answer.

    public static object? FormatNumber(Focus f, object?[] a) =>
        throw new JsonataException("U1203") { Value = "$formatNumber (XPath picture-string formatting) is not supported by the platform JSONata engine" };

    public static object? FormatInteger(Focus f, object?[] a) =>
        throw new JsonataException("U1203") { Value = "$formatInteger (XPath integer formatting) is not supported by the platform JSONata engine" };

    public static object? ParseInteger(Focus f, object?[] a) =>
        throw new JsonataException("U1203") { Value = "$parseInteger (XPath integer parsing) is not supported by the platform JSONata engine" };

    // ---- helpers -------------------------------------------------------------

    private static object?[] HofArgs(object? func, object? value, int index, JArr arr)
    {
        int arity = J.FunctionArity(func);
        var args = new List<object?> { value };
        if (arity >= 2) args.Add((double)index);
        if (arity >= 3) args.Add(arr);
        return args.ToArray();
    }

    private static object?[] HofArgsKV(object? func, object? value, string key, Dictionary<string, object?> obj)
    {
        int arity = J.FunctionArity(func);
        var args = new List<object?> { value };
        if (arity >= 2) args.Add(key);
        if (arity >= 3) args.Add(obj);
        return args.ToArray();
    }

    private static string PercentEncode(string str, string safe)
    {
        var sb = new StringBuilder();
        Span<byte> buf = stackalloc byte[4];
        foreach (var rune in str.EnumerateRunes())
        {
            if (rune.Value < 128 && safe.IndexOf((char)rune.Value) >= 0)
            {
                sb.Append((char)rune.Value);
            }
            else
            {
                int n = rune.EncodeToUtf8(buf);
                for (int i = 0; i < n; i++) sb.Append('%').Append(buf[i].ToString("X2"));
            }
        }
        return sb.ToString();
    }

    /// <summary>Percent-decode UTF-8. When <paramref name="keepReserved"/> is set (decodeURI), an
    /// escape whose decoded value is a reserved character is left intact.</summary>
    private static string PercentDecode(string str, string? keepReserved)
    {
        var sb = new StringBuilder();
        for (int i = 0; i < str.Length;)
        {
            if (str[i] == '%' && i + 2 < str.Length)
            {
                // collect a run of %XX bytes
                var bytes = new List<byte>();
                int j = i;
                while (j + 2 < str.Length && str[j] == '%')
                {
                    bytes.Add(Convert.ToByte(str.Substring(j + 1, 2), 16));
                    j += 3;
                }
                string decoded = Encoding.UTF8.GetString(bytes.ToArray());
                if (keepReserved != null && decoded.Length == 1 && keepReserved.IndexOf(decoded[0]) >= 0)
                    sb.Append(str, i, j - i); // keep the original escape(s)
                else
                    sb.Append(decoded);
                i = j;
            }
            else
            {
                sb.Append(str[i++]);
            }
        }
        return sb.ToString();
    }

    private static string NumberToRadix(long value, int radix)
    {
        if (value == 0) return "0";
        bool neg = value < 0;
        ulong v = neg ? (ulong)(-value) : (ulong)value;
        const string digits = "0123456789abcdefghijklmnopqrstuvwxyz";
        var sb = new StringBuilder();
        while (v > 0) { sb.Insert(0, digits[(int)(v % (ulong)radix)]); v /= (ulong)radix; }
        return neg ? "-" + sb : sb.ToString();
    }

    private static object? Num1(object?[] a, Func<double, double> op)
    {
        var arg = Arg(a, 0);
        if (J.IsUndef(arg)) return Undef;
        return op(ToNum(arg));
    }

    private static double ToNum(object? x)
    {
        if (x is double d) return d;
        throw new JsonataException("T0410") { Value = x };
    }

    private static JArr AsArray(object? x) => x is JArr a ? a : new JArr { x };

    /// <summary>Ordinal comparison for numbers/strings used by the default sort comparator.</summary>
    private static int Compare(object? a, object? b)
    {
        if (a is double da && b is double db) return da.CompareTo(db);
        if (a is string sa && b is string sb) return string.CompareOrdinal(sa, sb);
        return 0;
    }

    /// <summary>JS Array.prototype.slice semantics over a string's characters.</summary>
    private static string SliceString(string str, int start, int? end)
    {
        int len = str.Length;
        int s = start < 0 ? Math.Max(len + start, 0) : Math.Min(start, len);
        int e = end is null ? len : (end.Value < 0 ? Math.Max(len + end.Value, 0) : Math.Min(end.Value, len));
        if (e <= s) return "";
        return str.Substring(s, e - s);
    }
}
