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

        return frame;
    }
}
