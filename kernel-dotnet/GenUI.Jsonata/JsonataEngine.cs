namespace GenUI.Jsonata;

/// <summary>
/// Public entry point for the native C# JSONata port. Parse an expression once with
/// <see cref="Compile"/> and evaluate it against input data (optionally with variable bindings).
/// The result uses the value model described in <see cref="J"/>; JSONata "undefined" is returned as
/// the <see cref="J.Undefined"/> sentinel (callers that want provider semantics normalize it to null).
/// </summary>
public sealed class JsonataEngine
{
    private readonly Ast _ast;
    private readonly JEnvironment _staticFrame;
    private readonly Evaluator _evaluator;

    private JsonataEngine(Ast ast)
    {
        _ast = ast;
        _staticFrame = CreateStaticFrame();
        _evaluator = new Evaluator(_staticFrame);
    }

    /// <summary>Parse and prepare a JSONata expression for evaluation.</summary>
    public static JsonataEngine Compile(string expression) => new(Parser.Parse(expression));

    /// <summary>Evaluate the expression against <paramref name="input"/>, returning a value-model result.</summary>
    public object? Evaluate(object? input, IReadOnlyDictionary<string, object?>? bindings = null)
    {
        var env = new JEnvironment(_staticFrame);

        if (bindings != null)
        {
            foreach (var kv in bindings) env.Bind(kv.Key, kv.Value);
        }

        // wrap a top-level JSON array so it is treated as a single input document
        object? rootInput = input;
        if (input is JArr arr && !arr.Sequence)
        {
            var wrapper = new JArr(arr) { Sequence = true, OuterWrapper = true };
            rootInput = wrapper;
        }

        env.Bind("$", rootInput);
        return _evaluator.Evaluate(_ast, rootInput, env);
    }

    // ---- static frame (built-in function registrations) ----------------------

    private static JEnvironment CreateStaticFrame()
    {
        var frame = new JEnvironment(null);

        void Reg(string name, int arity, Func<Focus, object?[], object?> impl) =>
            frame.Bind(name, new NativeFunction(name, arity, impl));

        Reg("sum", 1, Functions.Sum);
        Reg("count", 1, Functions.Count);
        Reg("max", 1, Functions.Max);
        Reg("min", 1, Functions.Min);
        Reg("average", 1, Functions.Average);

        Reg("string", 1, Functions.String);
        Reg("substring", 3, Functions.Substring);
        Reg("substringBefore", 2, Functions.SubstringBefore);
        Reg("substringAfter", 2, Functions.SubstringAfter);
        Reg("lowercase", 1, Functions.Lowercase);
        Reg("uppercase", 1, Functions.Uppercase);
        Reg("length", 1, Functions.Length);
        Reg("trim", 1, Functions.Trim);
        Reg("pad", 3, Functions.Pad);
        Reg("contains", 2, Functions.Contains);
        Reg("replace", 4, Functions.Replace);
        Reg("split", 3, Functions.Split);
        Reg("match", 3, Functions.Match);
        Reg("join", 2, Functions.Join);

        Reg("number", 1, Functions.Number);
        Reg("abs", 1, Functions.Abs);
        Reg("floor", 1, Functions.Floor);
        Reg("ceil", 1, Functions.Ceil);
        Reg("round", 2, Functions.Round);
        Reg("sqrt", 1, Functions.Sqrt);
        Reg("power", 2, Functions.Power);
        Reg("boolean", 1, Functions.Boolean);
        Reg("not", 1, Functions.Not);

        Reg("map", 2, Functions.Map);
        Reg("filter", 2, Functions.Filter);
        Reg("reduce", 3, Functions.FoldLeft);
        Reg("keys", 1, Functions.Keys);
        Reg("lookup", 2, Functions.Lookup);
        Reg("append", 2, Functions.Append);
        Reg("exists", 1, Functions.Exists);
        Reg("reverse", 1, Functions.Reverse);
        Reg("sort", 2, Functions.Sort);
        Reg("distinct", 1, Functions.Distinct);
        Reg("type", 1, Functions.Type);

        Reg("single", 2, Functions.Single);
        Reg("sift", 2, Functions.Sift);
        Reg("each", 2, Functions.Each);
        Reg("zip", 2, Functions.Zip);
        Reg("spread", 1, Functions.Spread);
        Reg("merge", 1, Functions.Merge);
        Reg("error", 1, Functions.Error);
        Reg("assert", 2, Functions.Assert);
        Reg("clone", 1, Functions.Clone);
        Reg("eval", 2, Functions.Eval);

        Reg("base64encode", 1, Functions.Base64Encode);
        Reg("base64decode", 1, Functions.Base64Decode);
        Reg("encodeUrlComponent", 1, Functions.EncodeUrlComponent);
        Reg("encodeUrl", 1, Functions.EncodeUrl);
        Reg("decodeUrlComponent", 1, Functions.DecodeUrlComponent);
        Reg("decodeUrl", 1, Functions.DecodeUrl);

        Reg("formatBase", 2, Functions.FormatBase);
        Reg("random", 0, Functions.Random);
        Reg("shuffle", 1, Functions.Shuffle);
        Reg("now", 0, Functions.Now);
        Reg("millis", 0, Functions.Millis);
        Reg("fromMillis", 3, Functions.FromMillis);
        Reg("toMillis", 2, Functions.ToMillis);

        // Explicitly-scoped-out XPath F&O locale layer (see ADR-0027): registered so an accidental
        // call fails with an actionable message rather than a generic "unknown function".
        Reg("formatNumber", 3, Functions.FormatNumber);
        Reg("formatInteger", 2, Functions.FormatInteger);
        Reg("parseInteger", 2, Functions.ParseInteger);

        return frame;
    }
}
