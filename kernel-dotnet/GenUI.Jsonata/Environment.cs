namespace GenUI.Jsonata;

/// <summary>
/// An evaluation environment (frame). Faithful to the canonical <c>createFrame</c>: a set of local
/// bindings plus a link to the enclosing environment; <see cref="Lookup"/> walks the chain.
/// </summary>
public sealed class JEnvironment
{
    private readonly Dictionary<string, object?> _bindings = new(StringComparer.Ordinal);
    private readonly JEnvironment? _parent;

    public JEnvironment(JEnvironment? parent)
    {
        _parent = parent;
    }

    public void Bind(string name, object? value) => _bindings[name] = value;

    /// <summary>Look up a name; returns <see cref="J.Undefined"/> when unbound (canonical returns undefined).</summary>
    public object? Lookup(string name)
    {
        if (_bindings.TryGetValue(name, out var value)) return value;
        if (_parent != null) return _parent.Lookup(name);
        return J.Undefined;
    }

    /// <summary>Whether the name resolves to a bound value anywhere in the chain.</summary>
    public bool IsBound(string name)
    {
        if (_bindings.ContainsKey(name)) return true;
        return _parent != null && _parent.IsBound(name);
    }
}

/// <summary>A user-defined function (lambda) closure, mirroring the canonical <c>_jsonata_lambda</c> procedure.</summary>
public sealed class Lambda
{
    public object? Input;
    public JEnvironment Environment = null!;
    public List<Ast> Arguments = new();
    public Signature? Signature;
    public Ast Body = null!;
    public bool Thunk;
}

/// <summary>A built-in (native) function, mirroring the canonical <c>_jsonata_function</c> definition.</summary>
public sealed class NativeFunction
{
    public string Name = "";
    public Func<Focus, object?[], object?> Impl = null!;
    public Signature? Signature;

    /// <summary>Declared argument count, used by <see cref="J.FunctionArity"/> for higher-order dispatch.</summary>
    public int Arity;

    public NativeFunction(string name, int arity, Func<Focus, object?[], object?> impl)
    {
        Name = name;
        Arity = arity;
        Impl = impl;
    }
}

/// <summary>
/// The invocation context (<c>this</c>) passed to native functions. Carries the engine (for callbacks
/// into apply), the current environment, and the current input, plus a sequence factory.
/// </summary>
public sealed class Focus
{
    public Evaluator Engine = null!;
    public JEnvironment Environment = null!;
    public object? Input;

    public JArr NewSequence() => new() { Sequence = true };
}
