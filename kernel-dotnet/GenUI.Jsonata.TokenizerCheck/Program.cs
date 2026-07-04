using GenUI.Jsonata;

// Tokenizer smoke check for the native C# JSONata port.
//
// These expressions lex unambiguously, so their token streams are stable and easy to verify against
// the canonical tokenizer in jsonata.js. The full behavioral arbiter remains the shared corpus
// (conformance/jsonata/corpus.json), which gates the parser + evaluator once those modules land.

static IReadOnlyList<Token> Lex(string expr)
{
    var tk = new Tokenizer(expr);
    var toks = new List<Token>();
    // The parser passes prefix=true when a '/' would be a regex; for these fixtures no leading
    // regex context arises, so prefix=false throughout reproduces normal lexing.
    while (tk.Next(false) is { } t)
    {
        toks.Add(t);
    }
    return toks;
}

static bool ValueEquals(object? a, object? b)
{
    if (a is null || b is null) return a is null && b is null;
    if (a is double da && b is double db) return da == db;
    return a.Equals(b);
}

var cases = new (string Expr, (string Type, object? Value)[] Expected)[]
{
    ("a", new (string, object?)[] { ("name", "a") }),
    ("a.b.c", new (string, object?)[] { ("name", "a"), ("operator", "."), ("name", "b"), ("operator", "."), ("name", "c") }),
    ("1 + 2 * 3", new (string, object?)[] { ("number", 1.0), ("operator", "+"), ("number", 2.0), ("operator", "*"), ("number", 3.0) }),
    ("3.14", new (string, object?)[] { ("number", 3.14) }),
    ("1.5e3", new (string, object?)[] { ("number", 1500.0) }),
    ("$x := 10", new (string, object?)[] { ("variable", "x"), ("operator", ":="), ("number", 10.0) }),
    ("'hi'", new (string, object?)[] { ("string", "hi") }),
    ("\"esc\\n\"", new (string, object?)[] { ("string", "esc\n") }),
    ("true and false", new (string, object?)[] { ("value", true), ("operator", "and"), ("value", false) }),
    ("null", new (string, object?)[] { ("value", null) }),
    ("items[value > 1].value", new (string, object?)[]
    {
        ("name", "items"), ("operator", "["), ("name", "value"), ("operator", ">"), ("number", 1.0),
        ("operator", "]"), ("operator", "."), ("name", "value")
    }),
    ("$sum(a.b)", new (string, object?)[]
    {
        ("variable", "sum"), ("operator", "("), ("name", "a"), ("operator", "."), ("name", "b"), ("operator", ")")
    }),
    ("10 - 4", new (string, object?)[] { ("number", 10.0), ("operator", "-"), ("number", 4.0) }),
    ("**.name", new (string, object?)[] { ("operator", "**"), ("operator", "."), ("name", "name") }),
    ("`odd name`", new (string, object?)[] { ("name", "odd name") }),
    ("a ~> $f", new (string, object?)[] { ("name", "a"), ("operator", "~>"), ("variable", "f") }),
    ("x ?? y", new (string, object?)[] { ("name", "x"), ("operator", "??"), ("name", "y") }),
    ("2 in [1, 2]", new (string, object?)[]
    {
        ("number", 2.0), ("operator", "in"), ("operator", "["), ("number", 1.0), ("operator", ","), ("number", 2.0), ("operator", "]")
    }),
};

int pass = 0, fail = 0;

void Check(bool cond, string label)
{
    if (cond) { pass++; Console.WriteLine($"  PASS  {label}"); }
    else { fail++; Console.WriteLine($"  FAIL  {label}"); }
}

foreach (var (expr, expected) in cases)
{
    IReadOnlyList<Token> toks;
    try
    {
        toks = Lex(expr);
    }
    catch (JsonataException ex)
    {
        Check(false, $"{expr}  (threw {ex.Code}@{ex.Position})");
        continue;
    }

    if (toks.Count != expected.Length)
    {
        Check(false, $"{expr}  (token count {toks.Count} != {expected.Length})");
        continue;
    }

    bool ok = true;
    for (int i = 0; i < expected.Length; i++)
    {
        if (toks[i].Type != expected[i].Type || !ValueEquals(toks[i].Value, expected[i].Value))
        {
            ok = false;
            Check(false, $"{expr}  [{i}] got ({toks[i].Type},{toks[i].Value ?? "null"}) want ({expected[i].Type},{expected[i].Value ?? "null"})");
            break;
        }
    }
    if (ok) Check(true, expr);
}

// A couple of error-path checks (canonical S01xx codes).
static string? ErrCode(string expr)
{
    try { var tk = new Tokenizer(expr); while (tk.Next(false) is not null) { } return null; }
    catch (JsonataException ex) { return ex.Code; }
}

Check(ErrCode("'unterminated") == "S0101", "unterminated string -> S0101");
Check(ErrCode("`unterminated") == "S0105", "unterminated backtick name -> S0105");

Console.WriteLine();
if (fail == 0)
{
    Console.WriteLine($"OK: all {pass} tokenizer checks passed (C# JSONata port).");
    return 0;
}
Console.Error.WriteLine($"FAILED: {fail} tokenizer check(s) failed ({pass} passed).");
return 1;
