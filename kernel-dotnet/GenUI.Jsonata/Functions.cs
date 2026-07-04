using System.Globalization;
using System.Text;

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
        throw new JsonataException("T0410") { Value = token };
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
        throw new JsonataException("T0410") { Value = separator };
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
            if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                && !double.IsInfinity(parsed))
                return parsed;
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

    // ---- helpers -------------------------------------------------------------

    private static object?[] HofArgs(object? func, object? value, int index, JArr arr)
    {
        int arity = J.FunctionArity(func);
        var args = new List<object?> { value };
        if (arity >= 2) args.Add((double)index);
        if (arity >= 3) args.Add(arr);
        return args.ToArray();
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
