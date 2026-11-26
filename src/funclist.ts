// A light outline of a file: functions, classes, headings and sections found with patterns per language.

export interface Symbol {
  name: string;
  kind: string;
  line: number;
}

interface Rule {
  kind: string;
  pattern: RegExp;
}

const cLike: Rule[] = [
  { kind: "class", pattern: /^\s*(?:export\s+)?(?:public\s+|private\s+|abstract\s+|final\s+|static\s+)*(?:class|interface|struct|enum|namespace)\s+([A-Za-z_]\w*)/ },
  { kind: "function", pattern: /^\s*(?:[A-Za-z_][\w:<>,*&\s[\]]*?\s+)?[*&]*([A-Za-z_~][\w:]*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:->\s*[\w:<>]+\s*)?\{?\s*$/ },
];

const script: Rule[] = [
  { kind: "class", pattern: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+([A-Za-z_$][\w$]*)/ },
  { kind: "type", pattern: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/ },
  { kind: "function", pattern: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { kind: "function", pattern: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/ },
  { kind: "method", pattern: /^\s+(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{\s*$/ },
];

const rules: Record<string, Rule[]> = {
  JavaScript: script,
  TypeScript: script,
  JSX: script,
  TSX: script,
  Python: [
    { kind: "class", pattern: /^\s*class\s+([A-Za-z_]\w*)/ },
    { kind: "function", pattern: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ },
  ],
  Rust: [
    { kind: "type", pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union|mod)\s+([A-Za-z_]\w*)/ },
    { kind: "impl", pattern: /^\s*impl(?:<[^>]*>)?\s+([^{]+?)\s*\{?\s*$/ },
    { kind: "function", pattern: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/ },
  ],
  Go: [
    { kind: "type", pattern: /^type\s+([A-Za-z_]\w*)/ },
    { kind: "function", pattern: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/ },
  ],
  PHP: [
    { kind: "class", pattern: /^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait)\s+([A-Za-z_]\w*)/ },
    { kind: "function", pattern: /^\s*(?:public\s+|private\s+|protected\s+|static\s+)*function\s+&?([A-Za-z_]\w*)/ },
  ],
  Ruby: [
    { kind: "class", pattern: /^\s*(?:class|module)\s+([A-Za-z_][\w:]*)/ },
    { kind: "function", pattern: /^\s*def\s+([A-Za-z_][\w.?!=]*)/ },
  ],
  Lua: [{ kind: "function", pattern: /^\s*(?:local\s+)?function\s+([A-Za-z_][\w.:]*)/ }],
  Shell: [{ kind: "function", pattern: /^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{?/ }],
  PowerShell: [{ kind: "function", pattern: /^\s*function\s+([A-Za-z_][\w-]*)/i }],
  SQL: [{ kind: "object", pattern: /^\s*create\s+(?:or\s+replace\s+)?(?:table|view|function|procedure|trigger|index)\s+(?:if\s+not\s+exists\s+)?([\w."[\]`]+)/i }],
  Markdown: [{ kind: "heading", pattern: /^(#{1,6}\s+.+?)\s*#*$/ }],
  CSS: [{ kind: "rule", pattern: /^([^\s@/{}][^{}]*?)\s*\{\s*$/ }],
  SCSS: [{ kind: "rule", pattern: /^\s*([^\s/{}][^{};]*?)\s*\{\s*$/ }],
  HTML: [{ kind: "id", pattern: /<[a-z][\w-]*[^>]*\sid=["']([^"']+)["']/i }],
  Properties: [{ kind: "section", pattern: /^\s*\[([^\]]+)\]\s*$/ }],
  TOML: [{ kind: "section", pattern: /^\s*\[\[?([^\]]+)\]\]?\s*$/ }],
  YAML: [{ kind: "key", pattern: /^([A-Za-z_][\w-]*):\s*(?:#.*)?$/ }],
};

for (const name of ["C", "C++", "C#", "Java", "Kotlin", "Swift", "Dart", "Objective-C", "Objective-C++", "Scala"]) rules[name] = cLike;

const notFunctions = new Set(["if", "for", "while", "switch", "catch", "return", "else", "do", "sizeof", "new", "delete", "throw", "using"]);

export function supportsOutline(language: string): boolean {
  return language in rules;
}

export function outline(text: string, language: string): Symbol[] {
  const set = rules[language];
  if (!set) return [];
  const symbols: Symbol[] = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length && symbols.length < 3000; index += 1) {
    const line = lines[index];
    if (line.length > 400) continue;
    for (const rule of set) {
      const match = rule.pattern.exec(line);
      if (!match) continue;
      const name = match[1].trim();
      if (name && !notFunctions.has(name)) symbols.push({ name, kind: rule.kind, line: index + 1 });
      break;
    }
  }
  return symbols;
}
