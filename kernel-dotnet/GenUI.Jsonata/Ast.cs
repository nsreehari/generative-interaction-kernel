using System.Text.RegularExpressions;

namespace GenUI.Jsonata;

/// <summary>
/// A parse-tree / AST node. JSONata's reference implementation uses a single dynamic object shape
/// with many optional fields that are populated depending on <see cref="Type"/>. This class mirrors
/// that: it is a mutable bag of optional fields, which keeps the parser port line-by-line faithful.
/// </summary>
public sealed class Ast
{
    // --- identity / common ---
    public string Type = "";
    public object? Value;          // literal value, operator string, name, variable name, Regex, etc.
    public int Position;

    // Symbol backing (for the Pratt loop): binding power + nud/led behavior.
    public Symbol? Sym;
    public string Id => Sym?.Id ?? (Value as string ?? "");
    public int Lbp => Sym?.Lbp ?? 0;

    // --- binary / apply / bind ---
    public Ast? Lhs;
    public Ast? Rhs;

    // --- unary "other" (negation, single-expression) ---
    public Ast? Expression;

    // --- array / block ---
    public List<Ast>? Expressions;

    // --- object constructor (unary '{') and group-by pairs ---
    public List<(Ast Key, Ast Val)>? Pairs;
    public GroupNode? Group;

    // --- path ---
    public List<Ast>? Steps;
    public bool KeepSingletonArray;

    // --- steps: predicates / stages ---
    public List<Ast>? Predicate;   // list of 'filter' nodes
    public List<Ast>? Stages;      // list of 'filter'/'index' nodes
    public Ast? Expr;              // 'filter' node payload
    public List<SortTerm>? Terms;  // 'sort' step

    // --- function / partial / lambda ---
    public List<Ast>? Arguments;
    public Ast? Procedure;
    public Ast? Body;
    public Signature? Signature;
    public bool Thunk;
    public string? Name;

    // --- condition ---
    public Ast? Condition;
    public Ast? Then;
    public Ast? Else;

    // --- transform ---
    public Ast? Pattern;
    public Ast? Update;
    public Ast? Delete;

    // --- step flags / bindings ---
    public bool KeepArray;
    public bool Consarray;
    public string? Focus;          // @ focus variable name
    public string? Index;          // # index variable name
    public bool Tuple;
    public bool Predicated;        // marks predicate-derived function nodes (tail-call guard)

    // --- parent operator ancestry ---
    public Slot? Slot;
    public Slot? Ancestor;
    public List<Slot>? SeekingParent;

    /// <summary>Deep clone via re-serialization is not needed structurally here; JSONata clones the
    /// condition sub-tree for `?:`/`??`. We provide a structural clone for those two cases.</summary>
    public Ast ShallowCloneForCondition()
    {
        // The canonical does JSON.parse(JSON.stringify(left)); for the node types that can appear as
        // a coalescing/elvis condition (paths, functions, literals) a structural clone is sufficient.
        return Clone();
    }

    public Ast Clone()
    {
        var c = new Ast
        {
            Type = Type,
            Value = Value,
            Position = Position,
            Sym = Sym,
            KeepSingletonArray = KeepSingletonArray,
            KeepArray = KeepArray,
            Consarray = Consarray,
            Focus = Focus,
            Index = Index,
            Tuple = Tuple,
            Predicated = Predicated,
            Thunk = Thunk,
            Name = Name,
            Signature = Signature,
        };
        c.Lhs = Lhs?.Clone();
        c.Rhs = Rhs?.Clone();
        c.Expression = Expression?.Clone();
        c.Expressions = Expressions?.Select(e => e.Clone()).ToList();
        c.Pairs = Pairs?.Select(p => (p.Key.Clone(), p.Val.Clone())).ToList();
        c.Steps = Steps?.Select(e => e.Clone()).ToList();
        c.Predicate = Predicate?.Select(e => e.Clone()).ToList();
        c.Stages = Stages?.Select(e => e.Clone()).ToList();
        c.Expr = Expr?.Clone();
        c.Arguments = Arguments?.Select(e => e.Clone()).ToList();
        c.Procedure = Procedure?.Clone();
        c.Body = Body?.Clone();
        c.Condition = Condition?.Clone();
        c.Then = Then?.Clone();
        c.Else = Else?.Clone();
        c.Pattern = Pattern?.Clone();
        c.Update = Update?.Clone();
        c.Delete = Delete?.Clone();
        return c;
    }
}

/// <summary>An order-by term for the `^(...)` sort operator.</summary>
public sealed class SortTerm
{
    public bool Descending;
    public Ast Expression = null!;
}

/// <summary>Group-by payload: an ordered list of key/value expression pairs.</summary>
public sealed class GroupNode
{
    public List<(Ast Key, Ast Val)> Lhs = new();
    public int Position;
}

/// <summary>Ancestry slot used by the parent (`%`) operator resolution.</summary>
public sealed class Slot
{
    public string Label = "";
    public int Level;
    public int Index;
}

/// <summary>A Pratt-parser symbol: binding power plus null-denotation / left-denotation behavior.</summary>
public sealed class Symbol
{
    public string Id = "";
    public object? Value;
    public int Lbp;
    public Func<Parser, Ast, Ast>? Nud;        // (parser, self) -> node
    public Func<Parser, Ast, Ast, Ast>? Led;   // (parser, self, left) -> node
}
