namespace GenUI.Jsonata;

/// <summary>
/// The canonical operator table from jsonata.js. The values are left-binding powers used by the
/// Pratt parser; the keys are also used by the tokenizer as single-character operator recognition
/// and as stop characters for name tokens (note that '!' and '~' carry power 0 — they are not real
/// operators but must stop a name scan).
/// </summary>
public static class Operators
{
    public static readonly IReadOnlyDictionary<string, int> Table = new Dictionary<string, int>
    {
        ["."] = 75,
        ["["] = 80,
        ["]"] = 0,
        ["{"] = 70,
        ["}"] = 0,
        ["("] = 80,
        [")"] = 0,
        [","] = 0,
        ["@"] = 80,
        ["#"] = 80,
        [";"] = 80,
        [":"] = 80,
        ["?"] = 20,
        ["+"] = 50,
        ["-"] = 50,
        ["*"] = 60,
        ["/"] = 60,
        ["%"] = 60,
        ["|"] = 20,
        ["="] = 40,
        ["<"] = 40,
        [">"] = 40,
        ["^"] = 40,
        ["**"] = 60,
        [".."] = 20,
        [":="] = 10,
        ["!="] = 40,
        ["<="] = 40,
        [">="] = 40,
        ["~>"] = 40,
        ["?:"] = 40,
        ["??"] = 40,
        ["and"] = 30,
        ["or"] = 25,
        ["in"] = 40,
        ["&"] = 50,
        ["!"] = 0, // not an operator, but needed as a stop character for name tokens
        ["~"] = 0, // not an operator, but needed as a stop character for name tokens
    };

    /// <summary>JSON string escape sequences — see json.org. Mirrors the canonical `escapes` table.</summary>
    public static readonly IReadOnlyDictionary<char, char> Escapes = new Dictionary<char, char>
    {
        ['"'] = '"',
        ['\\'] = '\\',
        ['/'] = '/',
        ['b'] = '\b',
        ['f'] = '\f',
        ['n'] = '\n',
        ['r'] = '\r',
        ['t'] = '\t',
    };
}
