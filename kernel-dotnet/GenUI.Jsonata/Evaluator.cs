namespace GenUI.Jsonata;

/// <summary>
/// Synchronous port of the canonical JSONata evaluator (jsonata.js). The reference implementation is
/// async (Promise/generator based) to support external async functions; this port evaluates eagerly,
/// which is sufficient for the platform's pure-expression workloads. Tuple-stream focus/index
/// bindings, transforms, and partial application are not part of the supported surface.
/// </summary>
public sealed class Evaluator
{
    private readonly JEnvironment _staticFrame;
    private static readonly Ast ChainAst =
        Parser.Parse("function($f, $g) { function($x){ $g($f($x)) } }");

    public Evaluator(JEnvironment staticFrame)
    {
        _staticFrame = staticFrame;
    }

    // ---- main dispatch -------------------------------------------------------

    public object? Evaluate(Ast expr, object? input, JEnvironment environment)
    {
        object? result = expr.Type switch
        {
            "path" => EvaluatePath(expr, input, environment),
            "binary" => EvaluateBinary(expr, input, environment),
            "unary" => EvaluateUnary(expr, input, environment),
            "name" => EvaluateName(expr, input, environment),
            "string" or "number" or "value" => expr.Value,
            "wildcard" => EvaluateWildcard(expr, input, environment),
            "descendant" => EvaluateDescendants(expr, input, environment),
            "condition" => EvaluateCondition(expr, input, environment),
            "block" => EvaluateBlock(expr, input, environment),
            "bind" => EvaluateBindExpression(expr, input, environment),
            "function" => EvaluateFunction(expr, input, environment, false, null),
            "variable" => EvaluateVariable(expr, input, environment),
            "lambda" => EvaluateLambda(expr, input, environment),
            "apply" => EvaluateApplyExpression(expr, input, environment),
            _ => J.Undefined,
        };

        if (expr.Predicate != null)
        {
            foreach (var pred in expr.Predicate)
                result = EvaluateFilter(pred.Expr!, result, environment);
        }

        if (expr.Type != "path" && expr.Group != null)
        {
            result = EvaluateGroupExpression(expr.Group.Lhs, expr.Group.Position, result, environment);
        }

        if (result is JArr seq && seq.Sequence && !seq.TupleStream)
        {
            if (expr.KeepArray) seq.KeepSingleton = true;
            if (seq.Count == 0) return J.Undefined;
            if (seq.Count == 1) return seq.KeepSingleton ? seq : seq[0];
        }

        return result;
    }

    // ---- paths ---------------------------------------------------------------

    private object? EvaluatePath(Ast expr, object? input, JEnvironment environment)
    {
        JArr inputSequence;
        if (input is JArr arr && expr.Steps![0].Type != "variable")
        {
            inputSequence = arr;
        }
        else
        {
            inputSequence = CreateSequence(input);
        }

        JArr? resultSequence = null;

        for (int ii = 0; ii < expr.Steps!.Count; ii++)
        {
            var step = expr.Steps[ii];

            if (ii == 0 && step.Consarray)
            {
                resultSequence = AsSeq(Evaluate(step, inputSequence, environment));
            }
            else
            {
                resultSequence = EvaluateStep(step, inputSequence, environment, ii == expr.Steps.Count - 1);
            }

            if (resultSequence == null || resultSequence.Count == 0) break;

            if (step.Focus == null) inputSequence = resultSequence;
        }

        if (expr.KeepSingletonArray && resultSequence != null)
        {
            if (resultSequence.Cons && !resultSequence.Sequence)
            {
                resultSequence = CreateSequence(resultSequence);
            }
            resultSequence.KeepSingleton = true;
        }

        if (expr.Group != null && resultSequence != null)
        {
            return EvaluateGroupExpression(expr.Group.Lhs, expr.Group.Position, resultSequence, environment);
        }

        return resultSequence;
    }

    private JArr EvaluateStep(Ast expr, JArr input, JEnvironment environment, bool lastStep)
    {
        if (expr.Type == "sort")
        {
            return EvaluateSortExpression(expr, input, environment);
        }

        var result = CreateSequence();
        foreach (var item in input)
        {
            var res = Evaluate(expr, item, environment);
            if (expr.Stages != null)
            {
                foreach (var stage in expr.Stages)
                    res = EvaluateFilter(stage.Expr!, res, environment);
            }
            if (!J.IsUndef(res)) result.Add(res);
        }

        var resultSequence = CreateSequence();
        if (lastStep && result.Count == 1 && result[0] is JArr only && !only.Sequence)
        {
            resultSequence = only;
        }
        else
        {
            foreach (var res in result)
            {
                if (res is not JArr ra || ra.Cons)
                {
                    resultSequence.Add(res);
                }
                else
                {
                    foreach (var val in ra) resultSequence.Add(val);
                }
            }
        }
        return resultSequence;
    }

    private JArr EvaluateFilter(Ast predicate, object? input, JEnvironment environment)
    {
        var results = CreateSequence();
        var items = input as JArr ?? CreateSequence(input);

        if (predicate.Type == "number")
        {
            int index = (int)Math.Floor((double)predicate.Value!);
            if (index < 0) index = items.Count + index;
            if (index >= 0 && index < items.Count)
            {
                var item = items[index];
                if (item is JArr ia) results = ia;
                else results.Add(item);
            }
        }
        else
        {
            for (int index = 0; index < items.Count; index++)
            {
                var item = items[index];
                var res = Evaluate(predicate, item, environment);
                if (J.IsNumeric(res)) res = new JArr { res };
                if (J.IsArrayOfNumbers(res))
                {
                    foreach (var ires in (JArr)res!)
                    {
                        int ii = (int)Math.Floor((double)ires!);
                        if (ii < 0) ii = items.Count + ii;
                        if (ii == index) results.Add(item);
                    }
                }
                else if (Functions.Boolize(res))
                {
                    results.Add(item);
                }
            }
        }
        return results;
    }

    // ---- binary --------------------------------------------------------------

    private object? EvaluateBinary(Ast expr, object? input, JEnvironment environment)
    {
        var lhs = Evaluate(expr.Lhs!, input, environment);
        string op = (string)expr.Value!;

        if (op == "and" || op == "or")
        {
            bool lBool = Functions.Boolize(lhs);
            if (op == "and") return lBool && Functions.Boolize(Evaluate(expr.Rhs!, input, environment));
            return lBool || Functions.Boolize(Evaluate(expr.Rhs!, input, environment));
        }

        var rhs = Evaluate(expr.Rhs!, input, environment);
        try
        {
            return op switch
            {
                "+" or "-" or "*" or "/" or "%" => EvaluateNumericExpression(lhs, rhs, op),
                "=" or "!=" => EvaluateEqualityExpression(lhs, rhs, op),
                "<" or "<=" or ">" or ">=" => EvaluateComparisonExpression(lhs, rhs, op),
                "&" => EvaluateStringConcat(lhs, rhs),
                ".." => EvaluateRangeExpression(lhs, rhs),
                "in" => EvaluateIncludesExpression(lhs, rhs),
                _ => J.Undefined,
            };
        }
        catch (JsonataException ex)
        {
            throw new JsonataException(ex.Code, expr.Position, op) { Value = ex.Value };
        }
    }

    private static object? EvaluateNumericExpression(object? lhs, object? rhs, string op)
    {
        if (!J.IsUndef(lhs) && !J.IsNumeric(lhs)) throw new JsonataException("T2001") { Value = lhs };
        if (!J.IsUndef(rhs) && !J.IsNumeric(rhs)) throw new JsonataException("T2002") { Value = rhs };
        if (J.IsUndef(lhs) || J.IsUndef(rhs)) return J.Undefined;

        double a = (double)lhs!, b = (double)rhs!;
        return op switch
        {
            "+" => a + b,
            "-" => a - b,
            "*" => a * b,
            "/" => a / b,
            "%" => a % b,
            _ => J.Undefined,
        };
    }

    private static object? EvaluateEqualityExpression(object? lhs, object? rhs, string op)
    {
        if (J.IsUndef(lhs) || J.IsUndef(rhs)) return false;
        bool eq = J.DeepEqual(lhs, rhs);
        return op == "=" ? eq : !eq;
    }

    private static object? EvaluateComparisonExpression(object? lhs, object? rhs, string op)
    {
        bool lcomparable = J.IsUndef(lhs) || lhs is string || lhs is double;
        bool rcomparable = J.IsUndef(rhs) || rhs is string || rhs is double;
        if (!lcomparable || !rcomparable)
        {
            throw new JsonataException("T2010") { Value = !(lhs is string || lhs is double) ? lhs : rhs };
        }
        if (J.IsUndef(lhs) || J.IsUndef(rhs)) return J.Undefined;

        if (lhs is double dl && rhs is double dr)
        {
            return op switch { "<" => dl < dr, "<=" => dl <= dr, ">" => dl > dr, _ => dl >= dr };
        }
        if (lhs is string sl && rhs is string sr)
        {
            int c = string.CompareOrdinal(sl, sr);
            return op switch { "<" => c < 0, "<=" => c <= 0, ">" => c > 0, _ => c >= 0 };
        }
        throw new JsonataException("T2009") { Value = lhs };
    }

    private static object? EvaluateIncludesExpression(object? lhs, object? rhs)
    {
        if (J.IsUndef(lhs) || J.IsUndef(rhs)) return false;
        var items = rhs as JArr ?? new JArr { rhs };
        foreach (var item in items)
            if (J.DeepEqual(item, lhs)) return true;
        return false;
    }

    private static object? EvaluateStringConcat(object? lhs, object? rhs)
    {
        string lstr = J.IsUndef(lhs) ? "" : Functions.StrValue(lhs);
        string rstr = J.IsUndef(rhs) ? "" : Functions.StrValue(rhs);
        return lstr + rstr;
    }

    private object? EvaluateRangeExpression(object? lhs, object? rhs)
    {
        if (!J.IsUndef(lhs) && !(lhs is double dl0 && double.IsInteger(dl0)))
            throw new JsonataException("T2003") { Value = lhs };
        if (!J.IsUndef(rhs) && !(rhs is double dr0 && double.IsInteger(dr0)))
            throw new JsonataException("T2004") { Value = rhs };
        if (J.IsUndef(lhs) || J.IsUndef(rhs)) return J.Undefined;

        double lo = (double)lhs!, hi = (double)rhs!;
        if (lo > hi) return J.Undefined;

        var result = new JArr { Sequence = true };
        for (double v = lo; v <= hi; v++) result.Add(v);
        return result;
    }

    // ---- unary ---------------------------------------------------------------

    private object? EvaluateUnary(Ast expr, object? input, JEnvironment environment)
    {
        switch ((string)expr.Value!)
        {
            case "-":
                {
                    var value = Evaluate(expr.Expression!, input, environment);
                    if (J.IsUndef(value)) return J.Undefined;
                    if (J.IsNumeric(value)) return -(double)value!;
                    throw new JsonataException("D1002", expr.Position, "-") { Value = value };
                }
            case "[":
                {
                    var focus = Focus(input, environment);
                    var result = new JArr();
                    foreach (var item in expr.Expressions!)
                    {
                        var value = Evaluate(item, input, environment);
                        if (!J.IsUndef(value))
                        {
                            if (Equals(item.Value, "["))
                                result.Add(value);
                            else
                                result = AsSeq(Functions.AppendValue(focus, result, value))!;
                        }
                    }
                    if (expr.Consarray) result.Cons = true;
                    return result;
                }
            case "{":
                return EvaluateGroupExpression(expr.Pairs!, expr.Position, input, environment);
            default:
                return J.Undefined;
        }
    }

    // ---- names / wildcard / descendants --------------------------------------

    private object? EvaluateName(Ast expr, object? input, JEnvironment environment)
    {
        return Functions.LookupValue(Focus(input, environment), input, (string)expr.Value!);
    }

    private object? EvaluateWildcard(Ast expr, object? input, JEnvironment environment)
    {
        var focus = Focus(input, environment);
        var results = CreateSequence();
        if (input is JArr outer && outer.OuterWrapper && outer.Count > 0) input = outer[0];

        if (input is Dictionary<string, object?> obj)
        {
            foreach (var kv in obj)
            {
                var value = kv.Value;
                if (value is JArr)
                {
                    var flat = new List<object?>();
                    J.Flatten(value, flat);
                    results = AsSeq(Functions.AppendValue(focus, results, new JArr(flat)))!;
                }
                else
                {
                    results.Add(value);
                }
            }
        }
        else if (input is JArr arr)
        {
            foreach (var value in arr)
            {
                if (value is JArr)
                {
                    var flat = new List<object?>();
                    J.Flatten(value, flat);
                    results = AsSeq(Functions.AppendValue(focus, results, new JArr(flat)))!;
                }
                else
                {
                    results.Add(value);
                }
            }
        }
        return results;
    }

    private object? EvaluateDescendants(Ast expr, object? input, JEnvironment environment)
    {
        if (J.IsUndef(input)) return J.Undefined;
        var resultSequence = CreateSequence();
        RecurseDescendants(input, resultSequence);
        if (resultSequence.Count == 1) return resultSequence[0];
        return resultSequence;
    }

    private static void RecurseDescendants(object? input, JArr results)
    {
        if (input is JArr arr)
        {
            foreach (var member in arr) RecurseDescendants(member, results);
        }
        else if (input is Dictionary<string, object?> obj)
        {
            results.Add(input);
            foreach (var kv in obj) RecurseDescendants(kv.Value, results);
        }
        else
        {
            results.Add(input);
        }
    }

    // ---- object construction (group-by) --------------------------------------

    private object? EvaluateGroupExpression(List<(Ast Key, Ast Val)> pairs, int position, object? input, JEnvironment environment)
    {
        var focus = Focus(input, environment);
        var result = new Dictionary<string, object?>();
        var groups = new Dictionary<string, (object? Data, int ExprIndex)>();
        var order = new List<string>();

        var items = input as JArr ?? CreateSequence(input);
        if (items.Count == 0) items.Add(J.Undefined);

        foreach (var item in items)
        {
            for (int pairIndex = 0; pairIndex < pairs.Count; pairIndex++)
            {
                var key = Evaluate(pairs[pairIndex].Key, item, environment);
                if (key is not string keyStr)
                {
                    if (J.IsUndef(key)) continue;
                    throw new JsonataException("T1003", position) { Value = key };
                }

                if (keyStr is "_jsonata_lambda" or "_jsonata_function")
                    throw new JsonataException("D1013", position) { Value = keyStr };

                if (groups.TryGetValue(keyStr, out var existing))
                {
                    if (existing.ExprIndex != pairIndex)
                        throw new JsonataException("D1009", position) { Value = keyStr };
                    groups[keyStr] = (Functions.AppendValue(focus, existing.Data, item), pairIndex);
                }
                else
                {
                    groups[keyStr] = (item, pairIndex);
                    order.Add(keyStr);
                }
            }
        }

        foreach (var key in order)
        {
            var entry = groups[key];
            var value = Evaluate(pairs[entry.ExprIndex].Val, entry.Data, environment);
            if (!J.IsUndef(value)) result[key] = value;
        }

        return result;
    }

    // ---- control flow --------------------------------------------------------

    private object? EvaluateCondition(Ast expr, object? input, JEnvironment environment)
    {
        var condition = Evaluate(expr.Condition!, input, environment);
        if (Functions.Boolize(condition))
            return Evaluate(expr.Then!, input, environment);
        if (expr.Else != null)
            return Evaluate(expr.Else, input, environment);
        return J.Undefined;
    }

    private object? EvaluateBlock(Ast expr, object? input, JEnvironment environment)
    {
        var frame = new JEnvironment(environment);
        object? result = J.Undefined;
        foreach (var e in expr.Expressions!)
            result = Evaluate(e, input, frame);
        return result;
    }

    private object? EvaluateBindExpression(Ast expr, object? input, JEnvironment environment)
    {
        var value = Evaluate(expr.Rhs!, input, environment);
        environment.Bind((string)expr.Lhs!.Value!, value);
        return value;
    }

    private object? EvaluateVariable(Ast expr, object? input, JEnvironment environment)
    {
        string name = (string)expr.Value!;
        if (name == "")
        {
            return input is JArr arr && arr.OuterWrapper ? arr[0] : input;
        }
        return environment.Lookup(name);
    }

    // ---- sort ----------------------------------------------------------------

    private JArr EvaluateSortExpression(Ast expr, JArr input, JEnvironment environment)
    {
        bool Comp(object? a, object? b)
        {
            int comp = 0;
            for (int index = 0; comp == 0 && index < expr.Terms!.Count; index++)
            {
                var term = expr.Terms[index];
                var aa = Evaluate(term.Expression, a, environment);
                var bb = Evaluate(term.Expression, b, environment);

                bool aUndef = J.IsUndef(aa), bUndef = J.IsUndef(bb);
                if (aUndef) { comp = bUndef ? 0 : 1; continue; }
                if (bUndef) { comp = -1; continue; }

                bool aOk = aa is string || aa is double;
                bool bOk = bb is string || bb is double;
                if (!aOk || !bOk) throw new JsonataException("T2008") { Value = !aOk ? aa : bb };
                if (aa!.GetType() != bb!.GetType()) throw new JsonataException("T2007") { Value = aa };

                int c = aa is double da ? da.CompareTo((double)bb) : string.CompareOrdinal((string)aa, (string)bb);
                if (c == 0) continue;
                comp = c < 0 ? -1 : 1;
                if (term.Descending) comp = -comp;
            }
            return comp == 1;
        }

        return Functions.MergeSort(input, Comp);
    }

    // ---- function application ------------------------------------------------

    private object? EvaluateApplyExpression(Ast expr, object? input, JEnvironment environment)
    {
        var lhs = Evaluate(expr.Lhs!, input, environment);
        if (expr.Rhs!.Type == "function")
        {
            return EvaluateFunction(expr.Rhs, input, environment, true, lhs);
        }

        var func = Evaluate(expr.Rhs, input, environment);
        if (!J.IsFunction(func)) throw new JsonataException("T2006", expr.Position) { Value = func };

        if (J.IsFunction(lhs))
        {
            var chain = Evaluate(ChainAst, null, environment);
            return Apply(chain, new[] { lhs, func }, null, environment);
        }
        return Apply(func, new[] { lhs }, null, environment);
    }

    private object? EvaluateFunction(Ast expr, object? input, JEnvironment environment, bool hasApplyContext, object? applyContext)
    {
        var proc = Evaluate(expr.Procedure!, input, environment);

        if (J.IsUndef(proc) && expr.Procedure!.Type == "path"
            && environment.IsBound((string)expr.Procedure.Steps![0].Value!))
        {
            throw new JsonataException("T1005", expr.Position, (string)expr.Procedure.Steps![0].Value!);
        }

        var evaluatedArgs = new List<object?>();
        if (hasApplyContext) evaluatedArgs.Add(applyContext);
        foreach (var arg in expr.Arguments!)
            evaluatedArgs.Add(Evaluate(arg, input, environment));

        return Apply(proc, evaluatedArgs.ToArray(), input, environment);
    }

    /// <summary>Apply a procedure, running the tail-call trampoline for thunk lambdas.</summary>
    public object? Apply(object? proc, object?[] args, object? input, JEnvironment environment)
    {
        var result = ApplyInner(proc, args, input, environment);
        while (result is Lambda lam && lam.Thunk)
        {
            var next = Evaluate(lam.Body.Procedure!, lam.Input, lam.Environment);
            var evaluatedArgs = lam.Body.Arguments!
                .Select(a => Evaluate(a, lam.Input, lam.Environment))
                .ToArray();
            result = ApplyInner(next, evaluatedArgs, input, environment);
        }
        return result;
    }

    private object? ApplyInner(object? proc, object?[] args, object? input, JEnvironment environment)
    {
        switch (proc)
        {
            case Lambda l:
                return ApplyProcedure(l, args);
            case NativeFunction nf:
                return nf.Impl(new Focus { Engine = this, Environment = environment, Input = input }, args);
            default:
                throw new JsonataException("T1006");
        }
    }

    private object? ApplyProcedure(Lambda proc, object?[] args)
    {
        var env = new JEnvironment(proc.Environment);
        for (int i = 0; i < proc.Arguments.Count; i++)
        {
            env.Bind((string)proc.Arguments[i].Value!, i < args.Length ? args[i] : J.Undefined);
        }
        return Evaluate(proc.Body, proc.Input, env);
    }

    private object? EvaluateLambda(Ast expr, object? input, JEnvironment environment)
    {
        return new Lambda
        {
            Input = input,
            Environment = environment,
            Arguments = expr.Arguments ?? new List<Ast>(),
            Signature = expr.Signature,
            Body = expr.Body!,
            Thunk = expr.Thunk,
        };
    }

    // ---- helpers -------------------------------------------------------------

    private Focus Focus(object? input, JEnvironment environment) =>
        new() { Engine = this, Environment = environment, Input = input };

    private static JArr CreateSequence() => new() { Sequence = true };

    private static JArr CreateSequence(object? x)
    {
        var seq = new JArr { Sequence = true };
        seq.Add(x);
        return seq;
    }

    private static JArr? AsSeq(object? x)
    {
        if (x is JArr a) return a;
        if (J.IsUndef(x) || x is null) return null;
        return new JArr { x };
    }
}
