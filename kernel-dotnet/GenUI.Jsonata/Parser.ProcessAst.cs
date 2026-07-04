namespace GenUI.Jsonata;

/// <summary>
/// Post-parse AST processing: flattens location paths into arrays of steps, attaches
/// predicates/stages/group-by/sort, resolves parent-operator ancestry, and applies tail-call
/// optimization. Faithful port of the canonical <c>processAST</c> and its ancestry helpers.
/// </summary>
public sealed partial class Parser
{
    private Ast ProcessAst(Ast expr)
    {
        Ast result;
        switch (expr.Type)
        {
            case "binary":
                result = ProcessBinary(expr);
                break;

            case "unary":
                result = new Ast { Type = expr.Type, Value = expr.Value, Position = expr.Position };
                if (Equals(expr.Value, "["))
                {
                    result.Expressions = expr.Expressions!.Select(item =>
                    {
                        var value = ProcessAst(item);
                        PushAncestry(result, value);
                        return value;
                    }).ToList();
                }
                else if (Equals(expr.Value, "{"))
                {
                    result.Pairs = expr.Pairs!.Select(pair =>
                    {
                        var key = ProcessAst(pair.Key);
                        PushAncestry(result, key);
                        var value = ProcessAst(pair.Val);
                        PushAncestry(result, value);
                        return (key, value);
                    }).ToList();
                }
                else
                {
                    result.Expression = ProcessAst(expr.Expression!);
                    // unary minus on a number literal folds
                    if (Equals(expr.Value, "-") && result.Expression.Type == "number")
                    {
                        result = result.Expression;
                        result.Value = -(double)result.Value!;
                    }
                    else
                    {
                        PushAncestry(result, result.Expression);
                    }
                }
                break;

            case "function":
            case "partial":
                result = new Ast { Type = expr.Type, Name = expr.Name, Value = expr.Value, Position = expr.Position };
                result.Arguments = expr.Arguments!.Select(arg =>
                {
                    var argAst = ProcessAst(arg);
                    PushAncestry(result, argAst);
                    return argAst;
                }).ToList();
                result.Procedure = ProcessAst(expr.Procedure!);
                break;

            case "lambda":
                result = new Ast
                {
                    Type = expr.Type,
                    Arguments = expr.Arguments,
                    Signature = expr.Signature,
                    Position = expr.Position,
                };
                var body = ProcessAst(expr.Body!);
                result.Body = TailCallOptimize(body);
                break;

            case "condition":
                result = new Ast { Type = expr.Type, Position = expr.Position };
                result.Condition = ProcessAst(expr.Condition!);
                PushAncestry(result, result.Condition);
                result.Then = ProcessAst(expr.Then!);
                PushAncestry(result, result.Then);
                if (expr.Else != null)
                {
                    result.Else = ProcessAst(expr.Else);
                    PushAncestry(result, result.Else);
                }
                break;

            case "transform":
                result = new Ast { Type = expr.Type, Position = expr.Position };
                result.Pattern = ProcessAst(expr.Pattern!);
                result.Update = ProcessAst(expr.Update!);
                if (expr.Delete != null) result.Delete = ProcessAst(expr.Delete);
                break;

            case "block":
                result = new Ast { Type = expr.Type, Position = expr.Position };
                result.Expressions = expr.Expressions!.Select(item =>
                {
                    var part = ProcessAst(item);
                    PushAncestry(result, part);
                    if (part.Consarray || (part.Type == "path" && part.Steps![0].Consarray))
                    {
                        result.Consarray = true;
                    }
                    return part;
                }).ToList();
                break;

            case "name":
                result = new Ast { Type = "path", Steps = new List<Ast> { expr } };
                if (expr.KeepArray) result.KeepSingletonArray = true;
                break;

            case "parent":
                result = new Ast
                {
                    Type = "parent",
                    Slot = new Slot { Label = "!" + _ancestorLabel++, Level = 1, Index = _ancestorIndex++ },
                };
                _ancestry.Add(result);
                break;

            case "string":
            case "number":
            case "value":
            case "wildcard":
            case "descendant":
            case "variable":
            case "regex":
                result = expr;
                break;

            case "operator":
                if (Equals(expr.Value, "and") || Equals(expr.Value, "or") || Equals(expr.Value, "in"))
                {
                    expr.Type = "name";
                    result = ProcessAst(expr);
                }
                else if (Equals(expr.Value, "?"))
                {
                    result = expr;
                }
                else
                {
                    throw new JsonataException("S0201", expr.Position, expr.Value?.ToString());
                }
                break;

            default:
                {
                    string code = expr.Id == "(end)" ? "S0207" : "S0206";
                    throw new JsonataException(code, expr.Position, expr.Value?.ToString());
                }
        }

        if (expr.KeepArray) result.KeepArray = true;
        return result;
    }

    private Ast ProcessBinary(Ast expr)
    {
        Ast result;
        switch (expr.Value as string)
        {
            case ".":
                {
                    var lstep = ProcessAst(expr.Lhs!);
                    if (lstep.Type == "path") result = lstep;
                    else result = new Ast { Type = "path", Steps = new List<Ast> { lstep } };
                    if (lstep.Type == "parent") result.SeekingParent = new List<Slot> { lstep.Slot! };

                    var rest = ProcessAst(expr.Rhs!);
                    if (rest.Type == "path")
                    {
                        result.Steps!.AddRange(rest.Steps!);
                    }
                    else
                    {
                        if (rest.Predicate != null)
                        {
                            rest.Stages = rest.Predicate;
                            rest.Predicate = null;
                        }
                        result.Steps!.Add(rest);
                    }
                    // string-literal steps become names; number/value steps are illegal
                    foreach (var step in result.Steps!)
                    {
                        if (step.Type == "number" || step.Type == "value")
                        {
                            throw new JsonataException("S0213", step.Position, step.Value?.ToString());
                        }
                        if (step.Type == "string") step.Type = "name";
                    }
                    if (result.Steps!.Any(step => step.KeepArray)) result.KeepSingletonArray = true;
                    var firststep = result.Steps![0];
                    if (firststep.Type == "unary" && Equals(firststep.Value, "[")) firststep.Consarray = true;
                    var laststep0 = result.Steps![^1];
                    if (laststep0.Type == "unary" && Equals(laststep0.Value, "[")) laststep0.Consarray = true;
                    ResolveAncestry(result);
                    break;
                }

            case "[":
                {
                    result = ProcessAst(expr.Lhs!);
                    var step = result;
                    bool useStages = false;
                    if (result.Type == "path")
                    {
                        step = result.Steps![^1];
                        useStages = true;
                    }
                    if (step.Group != null)
                    {
                        throw new JsonataException("S0209", expr.Position);
                    }
                    var predicate = ProcessAst(expr.Rhs!);
                    if (predicate.SeekingParent != null)
                    {
                        foreach (var slot in predicate.SeekingParent)
                        {
                            if (slot.Level == 1) SeekParent(step, slot);
                            else slot.Level--;
                        }
                        PushAncestry(step, predicate);
                    }
                    var filter = new Ast { Type = "filter", Expr = predicate, Position = expr.Position };
                    if (useStages)
                    {
                        (step.Stages ??= new List<Ast>()).Add(filter);
                    }
                    else
                    {
                        (step.Predicate ??= new List<Ast>()).Add(filter);
                    }
                    break;
                }

            case "{":
                {
                    // group-by
                    result = ProcessAst(expr.Lhs!);
                    if (result.Group != null)
                    {
                        throw new JsonataException("S0210", expr.Position);
                    }
                    result.Group = new GroupNode
                    {
                        Lhs = expr.Pairs!.Select(pair => (ProcessAst(pair.Key), ProcessAst(pair.Val))).ToList(),
                        Position = expr.Position,
                    };
                    break;
                }

            case "^":
                {
                    // order-by
                    result = ProcessAst(expr.Lhs!);
                    if (result.Type != "path") result = new Ast { Type = "path", Steps = new List<Ast> { result } };
                    var sortStep = new Ast { Type = "sort", Position = expr.Position };
                    sortStep.Terms = expr.Terms!.Select(t =>
                    {
                        var expression = ProcessAst(t.Expression);
                        PushAncestry(sortStep, expression);
                        return new SortTerm { Descending = t.Descending, Expression = expression };
                    }).ToList();
                    result.Steps!.Add(sortStep);
                    ResolveAncestry(result);
                    break;
                }

            case ":=":
                result = new Ast { Type = "bind", Value = expr.Value, Position = expr.Position };
                result.Lhs = ProcessAst(expr.Lhs!);
                result.Rhs = ProcessAst(expr.Rhs!);
                PushAncestry(result, result.Rhs);
                break;

            case "@":
                {
                    result = ProcessAst(expr.Lhs!);
                    var step = result;
                    if (result.Type == "path") step = result.Steps![^1];
                    if (step.Stages != null || step.Predicate != null)
                    {
                        throw new JsonataException("S0215", expr.Position);
                    }
                    if (step.Type == "sort")
                    {
                        throw new JsonataException("S0216", expr.Position);
                    }
                    if (expr.KeepArray) step.KeepArray = true;
                    step.Focus = expr.Rhs!.Value?.ToString();
                    step.Tuple = true;
                    break;
                }

            case "#":
                {
                    result = ProcessAst(expr.Lhs!);
                    var step = result;
                    if (result.Type == "path")
                    {
                        step = result.Steps![^1];
                    }
                    else
                    {
                        result = new Ast { Type = "path", Steps = new List<Ast> { result } };
                        if (step.Predicate != null)
                        {
                            step.Stages = step.Predicate;
                            step.Predicate = null;
                        }
                    }
                    if (step.Stages == null)
                    {
                        step.Index = expr.Rhs!.Value?.ToString();
                    }
                    else
                    {
                        step.Stages.Add(new Ast { Type = "index", Value = expr.Rhs!.Value, Position = expr.Position });
                    }
                    step.Tuple = true;
                    break;
                }

            case "~>":
                result = new Ast { Type = "apply", Value = expr.Value, Position = expr.Position };
                result.Lhs = ProcessAst(expr.Lhs!);
                result.Rhs = ProcessAst(expr.Rhs!);
                result.KeepArray = result.Lhs.KeepArray || result.Rhs.KeepArray;
                break;

            default:
                result = new Ast { Type = expr.Type, Value = expr.Value, Position = expr.Position };
                result.Lhs = ProcessAst(expr.Lhs!);
                result.Rhs = ProcessAst(expr.Rhs!);
                PushAncestry(result, result.Lhs);
                PushAncestry(result, result.Rhs);
                break;
        }
        return result;
    }

    // ---- ancestry helpers ----------------------------------------------------

    private Slot SeekParent(Ast node, Slot slot)
    {
        switch (node.Type)
        {
            case "name":
            case "wildcard":
                slot.Level--;
                if (slot.Level == 0)
                {
                    if (node.Ancestor == null)
                    {
                        node.Ancestor = slot;
                    }
                    else
                    {
                        _ancestry[slot.Index].Slot!.Label = node.Ancestor.Label;
                        node.Ancestor = slot;
                    }
                    node.Tuple = true;
                }
                break;
            case "parent":
                slot.Level++;
                break;
            case "block":
                if (node.Expressions!.Count > 0)
                {
                    node.Tuple = true;
                    slot = SeekParent(node.Expressions[^1], slot);
                }
                break;
            case "path":
                node.Tuple = true;
                int index = node.Steps!.Count - 1;
                slot = SeekParent(node.Steps[index--], slot);
                while (slot.Level > 0 && index >= 0)
                {
                    slot = SeekParent(node.Steps[index--], slot);
                }
                break;
            default:
                throw new JsonataException("S0217", node.Position, node.Type);
        }
        return slot;
    }

    private static void PushAncestry(Ast result, Ast value)
    {
        if (value.SeekingParent != null || value.Type == "parent")
        {
            var slots = value.SeekingParent ?? new List<Slot>();
            if (value.Type == "parent") slots.Add(value.Slot!);
            if (result.SeekingParent == null) result.SeekingParent = slots;
            else result.SeekingParent.AddRange(slots);
        }
    }

    private void ResolveAncestry(Ast path)
    {
        int index = path.Steps!.Count - 1;
        var laststep = path.Steps[index];
        var slots = laststep.SeekingParent ?? new List<Slot>();
        if (laststep.Type == "parent") slots.Add(laststep.Slot!);
        foreach (var s in slots)
        {
            var slot = s;
            index = path.Steps.Count - 2;
            while (slot.Level > 0)
            {
                if (index < 0)
                {
                    if (path.SeekingParent == null) path.SeekingParent = new List<Slot> { slot };
                    else path.SeekingParent.Add(slot);
                    break;
                }
                var step = path.Steps[index--];
                while (index >= 0 && step.Focus != null && path.Steps[index].Focus != null)
                {
                    step = path.Steps[index--];
                }
                slot = SeekParent(step, slot);
            }
        }
    }

    private static Ast TailCallOptimize(Ast expr)
    {
        Ast result;
        if (expr.Type == "function" && !expr.Predicated)
        {
            var thunk = new Ast { Type = "lambda", Thunk = true, Arguments = new List<Ast>(), Position = expr.Position };
            thunk.Body = expr;
            result = thunk;
        }
        else if (expr.Type == "condition")
        {
            expr.Then = TailCallOptimize(expr.Then!);
            if (expr.Else != null) expr.Else = TailCallOptimize(expr.Else);
            result = expr;
        }
        else if (expr.Type == "block")
        {
            int length = expr.Expressions!.Count;
            if (length > 0)
            {
                expr.Expressions[length - 1] = TailCallOptimize(expr.Expressions[length - 1]);
            }
            result = expr;
        }
        else
        {
            result = expr;
        }
        return result;
    }
}
