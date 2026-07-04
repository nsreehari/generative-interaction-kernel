namespace GenUI.Jsonata;

/// <summary>
/// Pratt (top-down operator precedence) parser for JSONata, ported faithfully from the canonical
/// <c>parser</c> in jsonata.js. Produces the same post-processed AST (paths flattened into steps,
/// predicates/stages, group-by, sort, bindings, tail-call thunks) that the evaluator consumes.
/// Error recovery mode is not implemented (the platform always parses in strict mode).
/// </summary>
public sealed partial class Parser
{
    private readonly string _source;
    private readonly Tokenizer _tokenizer;
    private readonly Func<bool, Token?> _lexer;
    private readonly Dictionary<string, Symbol> _symbolTable = new(StringComparer.Ordinal);

    private Ast _node = null!;

    // parent-operator ancestry bookkeeping
    private int _ancestorLabel;
    private int _ancestorIndex;
    private readonly List<Ast> _ancestry = new();

    private Parser(string source)
    {
        _source = source;
        _tokenizer = new Tokenizer(source);
        _lexer = prefix => _tokenizer.Next(prefix);
        RegisterSymbols();
    }

    public static Ast Parse(string source)
    {
        var p = new Parser(source);
        return p.Run();
    }

    // ---- symbol table helpers ------------------------------------------------

    private Symbol GetSymbol(string id, int bp = 0)
    {
        if (_symbolTable.TryGetValue(id, out var s))
        {
            if (bp >= s.Lbp) s.Lbp = bp;
            return s;
        }
        s = new Symbol { Id = id, Value = id, Lbp = bp };
        _symbolTable[id] = s;
        return s;
    }

    private void Terminal(string id)
    {
        var s = GetSymbol(id, 0);
        s.Nud = (_, self) => self;
    }

    private Symbol Infix(string id, int bp = 0, Func<Parser, Ast, Ast, Ast>? led = null)
    {
        int bindingPower = bp != 0 ? bp : Operators.Table[id];
        var s = GetSymbol(id, bindingPower);
        s.Led = led ?? ((p, self, left) =>
        {
            self.Lhs = left;
            self.Rhs = p.Expression(bindingPower);
            self.Type = "binary";
            return self;
        });
        return s;
    }

    private Symbol Infixr(string id, int bp, Func<Parser, Ast, Ast, Ast> led)
    {
        var s = GetSymbol(id, bp);
        s.Led = led;
        return s;
    }

    private Symbol Prefix(string id, Func<Parser, Ast, Ast>? nud = null)
    {
        var s = GetSymbol(id);
        s.Nud = nud ?? ((p, self) =>
        {
            self.Expression = p.Expression(70);
            self.Type = "unary";
            return self;
        });
        return s;
    }

    // ---- Pratt core ----------------------------------------------------------

    private Ast Advance(string? id = null, bool infix = false)
    {
        if (id != null && _node.Id != id)
        {
            string code = _node.Id == "(end)" ? "S0203" : "S0202";
            throw new JsonataException(code, _node.Position, _node.Value?.ToString());
        }
        Token? next = _lexer(infix);
        if (next == null)
        {
            _node = NodeFromSymbol(_symbolTable["(end)"], null, "(end)", _source.Length);
            return _node;
        }
        object? value = next.Value;
        string type = next.Type;
        Symbol symbol;
        switch (type)
        {
            case "name":
            case "variable":
                symbol = _symbolTable["(name)"];
                break;
            case "operator":
                if (!_symbolTable.TryGetValue((string)value!, out symbol!))
                {
                    throw new JsonataException("S0204", next.Position, value?.ToString());
                }
                break;
            case "string":
            case "number":
            case "value":
                symbol = _symbolTable["(literal)"];
                break;
            case "regex":
                type = "regex";
                symbol = _symbolTable["(regex)"];
                break;
            default:
                throw new JsonataException("S0205", next.Position, value?.ToString());
        }
        _node = NodeFromSymbol(symbol, value, type, next.Position);
        return _node;
    }

    private static Ast NodeFromSymbol(Symbol sym, object? value, string type, int position) =>
        new() { Sym = sym, Value = value, Type = type, Position = position };

    private Ast Nud(Ast t)
    {
        if (t.Sym?.Nud != null) return t.Sym.Nud(this, t);
        throw new JsonataException("S0211", t.Position, t.Value?.ToString());
    }

    private Ast Led(Ast t, Ast left)
    {
        if (t.Sym?.Led != null) return t.Sym.Led(this, t, left);
        throw new JsonataException("S0201", t.Position, t.Value?.ToString());
    }

    // Pratt's algorithm
    public Ast Expression(int rbp)
    {
        Ast t = _node;
        Advance(null, true);
        Ast left = Nud(t);
        while (rbp < _node.Lbp)
        {
            t = _node;
            Advance();
            left = Led(t, left);
        }
        return left;
    }

    // ---- grammar registration ------------------------------------------------

    private void RegisterSymbols()
    {
        Terminal("(end)");
        Terminal("(name)");
        Terminal("(literal)");
        Terminal("(regex)");
        GetSymbol(":");
        GetSymbol(";");
        GetSymbol(",");
        GetSymbol(")");
        GetSymbol("]");
        GetSymbol("}");
        GetSymbol("..");
        Infix(".");
        Infix("+");
        Infix("-");
        Infix("*");
        Infix("/");
        Infix("%");
        Infix("=");
        Infix("<");
        Infix(">");
        Infix("!=");
        Infix("<=");
        Infix(">=");
        Infix("&");
        Infix("and");
        Infix("or");
        Infix("in");
        Terminal("and");
        Terminal("or");
        Terminal("in");
        Prefix("-");
        Infix("~>");

        // coalescing operator ??
        Infix("??", Operators.Table["??"], (p, self, left) =>
        {
            self.Type = "condition";
            var cond = new Ast
            {
                Type = "function",
                Value = "(",
                Procedure = new Ast { Type = "variable", Value = "exists" },
                Arguments = new List<Ast> { left.Clone() },
            };
            self.Condition = cond;
            self.Then = left;
            self.Else = p.Expression(0);
            return self;
        });

        // field wildcard (single level)
        Prefix("*", (_, self) => { self.Type = "wildcard"; return self; });
        // descendant wildcard (multi-level)
        Prefix("**", (_, self) => { self.Type = "descendant"; return self; });
        // parent operator
        Prefix("%", (_, self) => { self.Type = "parent"; return self; });

        // function invocation
        Infix("(", Operators.Table["("], (p, self, left) =>
        {
            self.Procedure = left;
            self.Type = "function";
            self.Arguments = new List<Ast>();
            if (p._node.Id != ")")
            {
                for (; ; )
                {
                    if (p._node.Type == "operator" && p._node.Id == "?")
                    {
                        self.Type = "partial";
                        self.Arguments.Add(p._node);
                        p.Advance("?");
                    }
                    else
                    {
                        self.Arguments.Add(p.Expression(0));
                    }
                    if (p._node.Id != ",") break;
                    p.Advance(",");
                }
            }
            p.Advance(")", true);
            // lambda definition?
            if (left.Type == "name" && (Equals(left.Value, "function") || Equals(left.Value, "\u03BB")))
            {
                foreach (var arg in self.Arguments)
                {
                    if (arg.Type != "variable")
                    {
                        throw new JsonataException("S0208", arg.Position, arg.Value?.ToString());
                    }
                }
                self.Type = "lambda";
                if (p._node.Id == "<")
                {
                    int sigPos = p._node.Position;
                    int depth = 1;
                    var sig = "<";
                    while (depth > 0 && p._node.Id != "{" && p._node.Id != "(end)")
                    {
                        var tok = p.Advance();
                        if (tok.Id == ">") depth--;
                        else if (tok.Id == "<") depth++;
                        sig += tok.Value;
                    }
                    p.Advance(">");
                    self.Signature = Signature.Parse(sig);
                }
                p.Advance("{");
                self.Body = p.Expression(0);
                p.Advance("}");
            }
            return self;
        });

        // parenthesis - block expression
        Prefix("(", (p, self) =>
        {
            var expressions = new List<Ast>();
            while (p._node.Id != ")")
            {
                expressions.Add(p.Expression(0));
                if (p._node.Id != ";") break;
                p.Advance(";");
            }
            p.Advance(")", true);
            self.Type = "block";
            self.Expressions = expressions;
            return self;
        });

        // array constructor
        Prefix("[", (p, self) =>
        {
            var a = new List<Ast>();
            if (p._node.Id != "]")
            {
                for (; ; )
                {
                    var item = p.Expression(0);
                    if (p._node.Id == "..")
                    {
                        var range = new Ast { Type = "binary", Value = "..", Position = p._node.Position, Lhs = item };
                        p.Advance("..");
                        range.Rhs = p.Expression(0);
                        item = range;
                    }
                    a.Add(item);
                    if (p._node.Id != ",") break;
                    p.Advance(",");
                }
            }
            p.Advance("]", true);
            self.Expressions = a;
            self.Type = "unary";
            return self;
        });

        // filter - predicate or array index
        Infix("[", Operators.Table["["], (p, self, left) =>
        {
            if (p._node.Id == "]")
            {
                var step = left;
                while (step != null && step.Type == "binary" && Equals(step.Value, "["))
                {
                    step = step.Lhs!;
                }
                step!.KeepArray = true;
                p.Advance("]");
                return left;
            }
            self.Lhs = left;
            self.Rhs = p.Expression(Operators.Table["]"]);
            self.Type = "binary";
            p.Advance("]", true);
            return self;
        });

        // order-by
        Infix("^", Operators.Table["^"], (p, self, left) =>
        {
            p.Advance("(");
            var terms = new List<SortTerm>();
            for (; ; )
            {
                var term = new SortTerm { Descending = false };
                if (p._node.Id == "<") p.Advance("<");
                else if (p._node.Id == ">") { term.Descending = true; p.Advance(">"); }
                term.Expression = p.Expression(0);
                terms.Add(term);
                if (p._node.Id != ",") break;
                p.Advance(",");
            }
            p.Advance(")");
            self.Lhs = left;
            self.Terms = terms;
            self.Type = "binary";
            self.Value = "^";
            return self;
        });

        // object constructor / grouping
        Prefix("{", (p, self) => ObjectParser(p, self, null));
        Infix("{", Operators.Table["{"], (p, self, left) => ObjectParser(p, self, left));

        // bind variable
        Infixr(":=", Operators.Table[":="], (p, self, left) =>
        {
            if (left.Type != "variable")
            {
                throw new JsonataException("S0212", left.Position, left.Value?.ToString());
            }
            self.Lhs = left;
            self.Rhs = p.Expression(Operators.Table[":="] - 1);
            self.Type = "binary";
            return self;
        });

        // focus variable bind
        Infix("@", Operators.Table["@"], (p, self, left) =>
        {
            self.Lhs = left;
            self.Rhs = p.Expression(Operators.Table["@"]);
            if (self.Rhs.Type != "variable")
            {
                throw new JsonataException("S0214", self.Rhs.Position, "@");
            }
            self.Type = "binary";
            return self;
        });

        // index (position) variable bind
        Infix("#", Operators.Table["#"], (p, self, left) =>
        {
            self.Lhs = left;
            self.Rhs = p.Expression(Operators.Table["#"]);
            if (self.Rhs.Type != "variable")
            {
                throw new JsonataException("S0214", self.Rhs.Position, "#");
            }
            self.Type = "binary";
            return self;
        });

        // if/then/else ternary operator ?:
        Infix("?", Operators.Table["?"], (p, self, left) =>
        {
            self.Type = "condition";
            self.Condition = left;
            self.Then = p.Expression(0);
            if (p._node.Id == ":")
            {
                p.Advance(":");
                self.Else = p.Expression(0);
            }
            return self;
        });

        // elvis / default operator ?:
        Infix("?:", Operators.Table["?:"], (p, self, left) =>
        {
            self.Type = "condition";
            self.Condition = left.Clone();
            self.Then = left;
            self.Else = p.Expression(0);
            return self;
        });

        // object transformer
        Prefix("|", (p, self) =>
        {
            self.Type = "transform";
            self.Pattern = p.Expression(0);
            p.Advance("|");
            self.Update = p.Expression(0);
            if (p._node.Id == ",")
            {
                p.Advance(",");
                self.Delete = p.Expression(0);
            }
            p.Advance("|");
            return self;
        });
    }

    private static Ast ObjectParser(Parser p, Ast self, Ast? left)
    {
        var a = new List<(Ast, Ast)>();
        if (p._node.Id != "}")
        {
            for (; ; )
            {
                var n = p.Expression(0);
                p.Advance(":");
                var v = p.Expression(0);
                a.Add((n, v));
                if (p._node.Id != ",") break;
                p.Advance(",");
            }
        }
        p.Advance("}", true);
        if (left == null)
        {
            self.Pairs = a;
            self.Type = "unary";
            self.Value = "{";
        }
        else
        {
            self.Lhs = left;
            self.Pairs = a;   // rhs pairs stored in Pairs; group-by handled in processAST via Value "{"
            self.Type = "binary";
            self.Value = "{";
        }
        return self;
    }

    // ---- run -----------------------------------------------------------------

    private Ast Run()
    {
        Advance();
        var expr = Expression(0);
        if (_node.Id != "(end)")
        {
            throw new JsonataException("S0201", _node.Position, _node.Value?.ToString());
        }
        expr = ProcessAst(expr);
        if (expr.Type == "parent" || expr.SeekingParent != null)
        {
            throw new JsonataException("S0217", expr.Position, expr.Type);
        }
        return expr;
    }
}
