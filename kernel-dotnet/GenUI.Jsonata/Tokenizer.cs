using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace GenUI.Jsonata;

/// <summary>
/// Lexer for JSONata expressions. This is a faithful, line-by-line port of the canonical
/// <c>tokenizer</c> in jsonata.js (v2.2.1): the same operators/escapes tables, the same
/// double-character operator handling, string/number/name scanning, and the same S01xx error codes.
/// The parser drives it one token at a time via <see cref="Next"/>.
/// </summary>
public sealed class Tokenizer
{
    private readonly string _path;
    private readonly int _length;
    private int _position;

    // Canonical whitespace set: ' \t\n\r\v'.
    private const string Whitespace = " \t\n\r\u000B";

    // Canonical number literal: /^-?(0|([1-9][0-9]*))(\.[0-9]+)?([Ee][-+]?[0-9]+)?/
    private static readonly Regex NumberRegex =
        new(@"^-?(0|([1-9][0-9]*))(\.[0-9]+)?([Ee][-+]?[0-9]+)?", RegexOptions.CultureInvariant);

    private static readonly Regex HexOctets = new("^[0-9a-fA-F]+$", RegexOptions.CultureInvariant);

    public Tokenizer(string path)
    {
        _path = path;
        _length = path.Length;
        _position = 0;
    }

    /// <summary>Current scan offset (mirrors the canonical closure's `position`).</summary>
    public int Position => _position;

    // JS String.charAt returns '' for out-of-range; we use '\0' as that sentinel — JSONata source
    // never contains a NUL, and none of the canonical comparisons match '\0'.
    private char CharAt(int i) => i >= 0 && i < _length ? _path[i] : '\0';

    private string Substring(int start, int end)
    {
        if (start < 0) start = 0;
        if (end > _length) end = _length;
        if (end <= start) return string.Empty;
        return _path.Substring(start, end - start);
    }

    private static bool IsWhitespace(char c) => c != '\0' && Whitespace.IndexOf(c) >= 0;

    private static Token Create(string type, object? value, int position) => new(type, value, position);

    /// <summary>
    /// Returns the next token, or <c>null</c> at end of input. When <paramref name="prefix"/> is
    /// true the lexer will not interpret a leading '/' as the start of a regex (the parser sets this
    /// based on grammatical position), matching the canonical `next(prefix)` contract.
    /// </summary>
    public Token? Next(bool prefix)
    {
        if (_position >= _length) return null;
        char currentChar = CharAt(_position);

        // skip whitespace
        while (_position < _length && IsWhitespace(currentChar))
        {
            _position++;
            currentChar = CharAt(_position);
        }

        // skip comments
        if (currentChar == '/' && CharAt(_position + 1) == '*')
        {
            int commentStart = _position;
            _position += 2;
            currentChar = CharAt(_position);
            while (!(currentChar == '*' && CharAt(_position + 1) == '/'))
            {
                currentChar = CharAt(++_position);
                if (_position >= _length)
                {
                    // no closing tag
                    throw new JsonataException("S0106", commentStart);
                }
            }
            _position += 2;
            currentChar = CharAt(_position);
            return Next(prefix); // need this to swallow any following whitespace
        }

        // test for regex
        if (prefix != true && currentChar == '/')
        {
            _position++;
            return Create(Token.Kind.Regex, ScanRegex(), _position);
        }

        // handle double-char operators
        if (currentChar == '.' && CharAt(_position + 1) == '.')
        {
            _position += 2;
            return Create(Token.Kind.Operator, "..", _position);
        }
        if (currentChar == ':' && CharAt(_position + 1) == '=')
        {
            _position += 2;
            return Create(Token.Kind.Operator, ":=", _position);
        }
        if (currentChar == '!' && CharAt(_position + 1) == '=')
        {
            _position += 2;
            return Create(Token.Kind.Operator, "!=", _position);
        }
        if (currentChar == '>' && CharAt(_position + 1) == '=')
        {
            _position += 2;
            return Create(Token.Kind.Operator, ">=", _position);
        }
        if (currentChar == '<' && CharAt(_position + 1) == '=')
        {
            _position += 2;
            return Create(Token.Kind.Operator, "<=", _position);
        }
        if (currentChar == '*' && CharAt(_position + 1) == '*')
        {
            _position += 2;
            return Create(Token.Kind.Operator, "**", _position);
        }
        if (currentChar == '~' && CharAt(_position + 1) == '>')
        {
            _position += 2;
            return Create(Token.Kind.Operator, "~>", _position);
        }
        if (currentChar == '?' && CharAt(_position + 1) == ':')
        {
            _position += 2;
            return Create(Token.Kind.Operator, "?:", _position);
        }
        if (currentChar == '?' && CharAt(_position + 1) == '?')
        {
            _position += 2;
            return Create(Token.Kind.Operator, "??", _position);
        }

        // test for single char operators
        if (Operators.Table.ContainsKey(currentChar.ToString()))
        {
            _position++;
            return Create(Token.Kind.Operator, currentChar.ToString(), _position);
        }

        // test for string literals
        if (currentChar == '"' || currentChar == '\'')
        {
            char quoteType = currentChar;
            _position++;
            var qstr = new StringBuilder();
            while (_position < _length)
            {
                currentChar = CharAt(_position);
                if (currentChar == '\\') // escape sequence
                {
                    _position++;
                    currentChar = CharAt(_position);
                    if (Operators.Escapes.TryGetValue(currentChar, out char esc))
                    {
                        qstr.Append(esc);
                    }
                    else if (currentChar == 'u')
                    {
                        // \u should be followed by 4 hex digits
                        string octets = Substring(_position + 1, _position + 5);
                        if (octets.Length == 4 && HexOctets.IsMatch(octets))
                        {
                            int codepoint = int.Parse(octets, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
                            qstr.Append((char)codepoint);
                            _position += 4;
                        }
                        else
                        {
                            throw new JsonataException("S0104", _position);
                        }
                    }
                    else
                    {
                        // illegal escape sequence
                        throw new JsonataException("S0103", _position, currentChar.ToString());
                    }
                }
                else if (currentChar == quoteType)
                {
                    _position++;
                    return Create(Token.Kind.String, qstr.ToString(), _position);
                }
                else
                {
                    qstr.Append(currentChar);
                }
                _position++;
            }
            throw new JsonataException("S0101", _position);
        }

        // test for numbers
        Match match = NumberRegex.Match(Substring(_position, _length));
        if (match.Success && match.Index == 0 && match.Length > 0)
        {
            double num = double.Parse(match.Value, NumberStyles.Float, CultureInfo.InvariantCulture);
            if (double.IsFinite(num))
            {
                _position += match.Value.Length;
                return Create(Token.Kind.Number, num, _position);
            }
            throw new JsonataException("S0102", _position, match.Value);
        }

        // test for quoted names (backticks)
        string name;
        if (currentChar == '`')
        {
            _position++;
            int end = _path.IndexOf('`', _position);
            if (end != -1)
            {
                name = Substring(_position, end);
                _position = end + 1;
                return Create(Token.Kind.Name, name, _position);
            }
            _position = _length;
            throw new JsonataException("S0105", _position);
        }

        // test for names
        int i = _position;
        for (; ; )
        {
            char ch = CharAt(i);
            if (i == _length || IsWhitespace(ch) || Operators.Table.ContainsKey(ch.ToString()))
            {
                if (CharAt(_position) == '$')
                {
                    // variable reference
                    name = Substring(_position + 1, i);
                    _position = i;
                    return Create(Token.Kind.Variable, name, _position);
                }

                name = Substring(_position, i);
                _position = i;
                switch (name)
                {
                    case "or":
                    case "in":
                    case "and":
                        return Create(Token.Kind.Operator, name, _position);
                    case "true":
                        return Create(Token.Kind.Value, true, _position);
                    case "false":
                        return Create(Token.Kind.Value, false, _position);
                    case "null":
                        return Create(Token.Kind.Value, null, _position);
                    default:
                        if (_position == _length && name == string.Empty)
                        {
                            // whitespace at end of input
                            return null;
                        }
                        return Create(Token.Kind.Name, name, _position);
                }
            }
            i++;
        }
    }

    /// <summary>
    /// Scans a regular-expression literal after the opening '/' has been consumed. Faithful port of
    /// the canonical <c>scanRegex</c>: tracks bracket depth, honors escaped slashes, and reads the
    /// trailing i/m flags. Returns a compiled <see cref="Regex"/> ('g' is implicit at match time).
    /// </summary>
    private Regex ScanRegex()
    {
        int start = _position;
        int depth = 0;

        bool IsClosingSlash(int pos)
        {
            if (CharAt(pos) == '/' && depth == 0)
            {
                int backslashCount = 0;
                while (CharAt(pos - (backslashCount + 1)) == '\\')
                {
                    backslashCount++;
                }
                if (backslashCount % 2 == 0)
                {
                    return true;
                }
            }
            return false;
        }

        while (_position < _length)
        {
            char currentChar = CharAt(_position);
            if (IsClosingSlash(_position))
            {
                string pattern = Substring(start, _position);
                if (pattern == string.Empty)
                {
                    throw new JsonataException("S0301", _position);
                }
                _position++;
                currentChar = CharAt(_position);
                // flags
                start = _position;
                var options = RegexOptions.CultureInvariant;
                while (currentChar == 'i' || currentChar == 'm')
                {
                    if (currentChar == 'i') options |= RegexOptions.IgnoreCase;
                    if (currentChar == 'm') options |= RegexOptions.Multiline;
                    _position++;
                    currentChar = CharAt(_position);
                }
                return new Regex(pattern, options);
            }
            if ((currentChar == '(' || currentChar == '[' || currentChar == '{') && CharAt(_position - 1) != '\\')
            {
                depth++;
            }
            if ((currentChar == ')' || currentChar == ']' || currentChar == '}') && CharAt(_position - 1) != '\\')
            {
                depth--;
            }
            _position++;
        }
        throw new JsonataException("S0302", _position);
    }
}
