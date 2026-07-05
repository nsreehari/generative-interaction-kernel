// Safe-subset validation for predicate positions. Mirrors the TypeScript reference
// (providers.ts `denyUnsafe`). Constructs with no legitimate place in an agent-authored
// predicate (guard / gate / visibility) — dynamic evaluation ($eval), user-defined /
// recursive functions (lambda), and structural rewrites (transform) — are the code-injection
// and DoS surface. They are rejected at COMPILE time by walking the parsed AST, so an unsafe
// predicate never reaches evaluation. Enforcement is a provider capability, not a kernel
// concern (ADR-0028): the kernel stays expression-language-neutral.

namespace GenUI.Jsonata;

/// <summary>Thrown when a safe-mode compile encounters a construct outside the predicate subset.</summary>
public sealed class SafeExpressionException : Exception
{
    public string Construct { get; }
    public string Expression { get; }

    public SafeExpressionException(string construct, string expression)
        : base($"Unsafe expression construct \"{construct}\" is not allowed in a predicate position: {expression}")
    {
        Construct = construct;
        Expression = expression;
    }
}

internal static class SafeMode
{
    public static void Validate(Ast ast, string expression) => Walk(ast, expression);

    private static void Walk(Ast? node, string expr)
    {
        if (node is null) return;

        switch (node.Type)
        {
            case "lambda":
                throw new SafeExpressionException("function definition", expr);
            case "transform":
                throw new SafeExpressionException("transform", expr);
            case "function" when node.Procedure is { Type: "variable" } p && (p.Value as string) == "eval":
                throw new SafeExpressionException("$eval", expr);
        }

        Walk(node.Lhs, expr);
        Walk(node.Rhs, expr);
        Walk(node.Expression, expr);
        Walk(node.Expr, expr);
        Walk(node.Procedure, expr);
        Walk(node.Body, expr);
        Walk(node.Condition, expr);
        Walk(node.Then, expr);
        Walk(node.Else, expr);
        Walk(node.Pattern, expr);
        Walk(node.Update, expr);
        Walk(node.Delete, expr);

        WalkList(node.Expressions, expr);
        WalkList(node.Steps, expr);
        WalkList(node.Predicate, expr);
        WalkList(node.Stages, expr);
        WalkList(node.Arguments, expr);

        if (node.Pairs is not null)
            foreach (var (key, val) in node.Pairs) { Walk(key, expr); Walk(val, expr); }
        if (node.Group is not null)
            foreach (var (key, val) in node.Group.Lhs) { Walk(key, expr); Walk(val, expr); }
        if (node.Terms is not null)
            foreach (var term in node.Terms) Walk(term.Expression, expr);
    }

    private static void WalkList(List<Ast>? list, string expr)
    {
        if (list is null) return;
        foreach (var item in list) Walk(item, expr);
    }
}
