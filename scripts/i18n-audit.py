#!/usr/bin/env python3
"""
i18n coverage gate for Symponia.

Extracts every string the app can actually RENDER, and asserts each one exists
as a key in all 8 translation dictionaries.

Why this exists: components/Text.tsx translates ONLY a plain string child.
Anything reaching the screen through another door -- a `placeholder=` prop, a
notification body, an interpolated template literal -- is invisible to <Text>
and will render English forever. A naive "grep the literals" extractor misses
exactly those, which is how the first localisation pass shipped ~45 English
strings while reporting 100% coverage.

Run:  python3 scripts/i18n-audit.py
Exit: 0 = every renderable string is translated in all 8 languages.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ["es", "pt", "de", "fr", "it", "ru", "da", "sv"]

# Strings that reach the screen but are NOT prose: style tokens, Intl options,
# URLs, route paths, brand names. Translating these would break things.
NOISE_EXACT = {
    "SYMPONIA", "Symponia", "Symponia Monthly", "symponia.io",
    "long", "short", "numeric", "2-digit", "underline", "none",
    "en-GB", "en-US",
    # Phase enum values compared against in JSX (phase === 'before'), not copy.
    "before", "after",
}
NOISE_RE = re.compile(r"^(https?://|/|#|[\d\W_]*$)")

# Arrays whose bare string elements are display copy, not data.
# DAY_KEYS: the mood-chart axis. Iterated as a variable, so a JSX-literal scan
# never sees them — they would have shipped in English on every chart.
DISPLAY_ARRAYS = ["ZOO_LABELS", "WEEKLY", "MONTHLY", "messages", "DAY_KEYS", "WALK_BODIES"]


_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "'": "'", '"': '"', "\\": "\\", "`": "`"}


def unescape(s: str) -> str:
    """Source text -> the string the app actually holds at runtime.

    This matters: t() is called with the RUNTIME value. A key written in the
    .tsx as "...an \\"ask more\\" link..." and in the dict as '...an "ask more"
    link...' are the same string to JavaScript but different bytes on disk.
    Comparing source-form would report a phantom miss (or, worse, miss a real
    one). Normalise both sides before diffing.
    """
    out, i = [], 0
    while i < len(s):
        if s[i] == "\\" and i + 1 < len(s):
            out.append(_ESCAPES.get(s[i + 1], s[i + 1]))
            i += 2
        else:
            out.append(s[i])
            i += 1
    return "".join(out)


def is_prose(s: str) -> bool:
    if s in NOISE_EXACT:
        return False
    if NOISE_RE.match(s):
        return False
    return bool(re.search(r"[A-Za-z]{2}", s))


def read_dict_keys(lang: str) -> set:
    src = open(os.path.join(ROOT, "constants", "translations", f"{lang}.ts")).read()
    keys = set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)'\s*:", src, re.M))
    keys |= set(re.findall(r'^\s*"((?:[^"\\]|\\.)*)"\s*:', src, re.M))
    return {unescape(k) for k in keys}


def scan_text_elements(src: str):
    """Yield (line, attrs, body) for every <Text ...>...</Text>, brace-aware so
    that arrow functions in props (onPress={() => ...}) don't truncate attrs."""
    i = 0
    n = len(src)
    while True:
        m = re.compile(r"<Text\b").search(src, i)
        if not m:
            return
        j = m.end()
        depth = 0
        while j < n:
            c = src[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            elif c == ">" and depth == 0:
                break
            j += 1
        attrs = src[m.end():j]
        if attrs.rstrip().endswith("/"):          # self-closing
            i = j + 1
            continue
        # body: read to the matching </Text>, honouring nested <Text>
        k = j + 1
        nest = 1
        while k < n and nest:
            if src.startswith("<Text", k):
                nest += 1
            elif src.startswith("</Text>", k):
                nest -= 1
                if nest == 0:
                    break
            k += 1
        body = src[j + 1:k]
        yield src[:m.start()].count("\n") + 1, attrs, body
        i = k + 1


# One pass, alternating quote styles, so an apostrophe inside a "double-quoted"
# string can never open a bogus 'single-quoted' match.
STRING_RE = re.compile(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"")


def string_literals(s: str):
    for m in STRING_RE.finditer(s):
        yield m.group(1) if m.group(1) is not None else m.group(2)


def candidates_from_body(body: str):
    # (a) plain literal child: no braces, no nested tags
    stripped = body.strip()
    if stripped and "{" not in stripped and "<" not in stripped:
        return [re.sub(r"\s+", " ", stripped)]
    # (b) string literals inside JSX expressions ({'x'}, ternaries), but skip
    #     anything sitting inside a member call like Linking.openURL('...').
    #     The dot is required: a bare `\w+\(...\)` pattern would also eat prose
    #     parentheses, e.g. "your first name (as provided during onboarding)".
    scrubbed = re.sub(r"[\w$]+(?:\.[\w$]+)+\s*\([^)]*\)", "", body)
    return list(string_literals(scrubbed))


def collect_renderable():
    """{string: [locations]} for everything the user can read."""
    found = {}

    def add(s, loc):
        s = unescape(s)
        if is_prose(s):
            found.setdefault(s, []).append(loc)

    files = glob.glob(os.path.join(ROOT, "app", "**", "*.tsx"), recursive=True)
    files += glob.glob(os.path.join(ROOT, "components", "*.tsx"))

    # Notification bodies never touch <Text>, but they DO go through t() at
    # schedule time, so their English source strings must exist as dict keys.
    nsrc = open(os.path.join(ROOT, "services", "notifications.ts")).read()
    nsrc = re.sub(r"(?m)^\s*import\s.*$", "", nsrc)
    for s in string_literals(nsrc):
        if is_prose(s) and " " in s and len(s) > 12:
            add(s, "services/notifications.ts")

    # Subscription plan copy lives on the product definitions in iap.ts and is
    # rendered as t(sub.titleKey) — a VARIABLE, invisible to a JSX-literal scan.
    # Every `*Key` field is an English source string and must be a dict key, or a
    # German subscriber reads their plan in English.
    isrc = open(os.path.join(ROOT, "services", "iap.ts")).read()
    for m in re.finditer(r"\w+Key:\s*(?=['\"])", isrc):
        lit = next(string_literals(isrc[m.end():m.end() + 600]), None)
        if lit:
            add(lit, "services/iap.ts (plan)")

    for f in files:
        if f.endswith("components/Text.tsx"):
            continue  # the translator itself
        rel = os.path.relpath(f, ROOT)
        src = open(f).read()

        # 1. <Text> children (unless raw)
        for line, attrs, body in scan_text_elements(src):
            if re.search(r"\braw\b", attrs):
                continue
            for s in candidates_from_body(body):
                add(s, f"{rel}:{line}")

        # 2. Display copy that lives in DATA, not JSX -- attune question banks,
        #    home-screen mode cards, zoo labels, frequency descriptions, coach
        #    tips. These reach the screen as <Text>{q.q}</Text>, i.e. a variable.
        #    <Text> still translates them (the child is a string at runtime), but
        #    a naive JSX-literal scan never sees them, so they silently drifted
        #    out of the dictionaries. Field names are allowlisted so that DB
        #    values and ids sitting in the same object ('he/him', 'daily-reflection',
        #    'Intellectual') are never picked up and never translated.
        for m in re.finditer(r"\b(?:q|title|subtitle|desc|label|body|text):\s*(?=['\"])", src):
            lit = next(string_literals(src[m.end():m.end() + 1500]), None)
            if lit:
                add(lit, f"{rel}:{src[:m.start()].count(chr(10)) + 1} (data)")

        # bare string arrays of display copy (options: [...], ZOO_LABELS, ...)
        for name in DISPLAY_ARRAYS:
            for m in re.finditer(rf"\b{name}\s*(?::[^=]*)?=\s*\[(.*?)\]", src, re.S):
                for s in string_literals(m.group(1)):
                    add(s, f"{rel}:{src[:m.start()].count(chr(10)) + 1} (data)")
        for m in re.finditer(r"\boptions:\s*\[(.*?)\]", src, re.S):
            for s in string_literals(m.group(1)):
                add(s, f"{rel}:{src[:m.start()].count(chr(10)) + 1} (data)")

        # 3. everything already routed through t()
        for m in re.finditer(r"\bt\(\s*'((?:[^'\\]|\\.)*)'", src):
            add(m.group(1), f"{rel}:{src[:m.start()].count(chr(10)) + 1} (t)")
        for m in re.finditer(r'\bt\(\s*"((?:[^"\\]|\\.)*)"', src):
            add(m.group(1), f"{rel}:{src[:m.start()].count(chr(10)) + 1} (t)")

    return found


def _strip_t_calls(s: str) -> str:
    return re.sub(r"\bt\(\s*(?:'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")", "", s)


def split_children(body: str):
    """Top-level children of a <Text> body: text runs, {expressions}, <tags>."""
    parts, buf, depth, tag = [], "", 0, 0
    for c in body:
        if c == "{" and tag == 0:
            if depth == 0 and buf.strip():
                parts.append(buf)
                buf = ""
            depth += 1
        elif c == "}" and tag == 0:
            depth -= 1
            if depth == 0:
                parts.append(buf + c)
                buf = ""
                continue
        elif c == "<" and depth == 0:
            if tag == 0 and buf.strip():
                parts.append(buf)
                buf = ""
            tag += 1 if not buf.endswith("/") else 0
        elif c == ">" and depth == 0 and tag:
            pass
        buf += c
    if buf.strip():
        parts.append(buf)
    return [p for p in parts if p.strip()]


def collect_unreachable():
    """Prose literals sitting inside a MULTI-CHILD <Text>. React hands Text an
    array, not a string, so components/Text.tsx passes it through untouched --
    these render English in every language no matter what the dict says."""
    hits = []
    files = glob.glob(os.path.join(ROOT, "app", "**", "*.tsx"), recursive=True)
    files += glob.glob(os.path.join(ROOT, "components", "*.tsx"))
    for f in files:
        if f.endswith("components/Text.tsx"):
            continue
        rel = os.path.relpath(f, ROOT)
        src = open(f).read()
        for line, attrs, body in scan_text_elements(src):
            if re.search(r"\braw\b", attrs):
                continue
            kids = split_children(body)
            if len(kids) < 2:
                continue  # single child -> becomes a string -> t() handles it
            for k in kids:
                ks = k.strip()
                if ks.startswith("<"):
                    continue  # nested <Text> gets its own single string child
                if ks.startswith("{"):
                    # an expression: only its string literals are copy;
                    # bare identifiers (tokens, userEmail) render values.
                    for s in string_literals(_strip_t_calls(ks)):
                        if is_prose(s):
                            hits.append((s, f"{rel}:{line}", "multi-child"))
                else:
                    # a raw JSX text run sitting beside other children
                    txt = re.sub(r"\s+", " ", ks)
                    if is_prose(txt):
                        hits.append((txt, f"{rel}:{line}", "multi-child"))
    return hits


def collect_unwrapped():
    """Prose that reaches the screen through a door <Text> cannot open.
    Every literal here must already be inside t()."""
    hits = []

    # (a) placeholder= props on TextInput
    for f in glob.glob(os.path.join(ROOT, "app", "**", "*.tsx"), recursive=True):
        rel = os.path.relpath(f, ROOT)
        src = open(f).read()
        for m in re.finditer(r"placeholder=(\{[^\n]*|\"[^\"]*\")", src):
            for s in string_literals(_strip_t_calls(m.group(1))):
                if is_prose(s) and " " in s:  # 'animal' etc. are mode flags, not copy
                    hits.append((s, f"{rel}:{src[:m.start()].count(chr(10)) + 1}",
                                 "placeholder"))

    # (b) notification copy -- fires outside the app, <Text> never runs.
    #     The English source strings live in the WEEKLY/MONTHLY arrays (they ARE
    #     the dict keys); what must never happen is a literal handed straight to
    #     `body:`/`title:` without going through t().
    nf = os.path.join(ROOT, "services", "notifications.ts")
    src = open(nf).read()
    for m in re.finditer(r"\b(?:body|title):\s*([^,\n]+)", src):
        for s in string_literals(_strip_t_calls(m.group(1))):
            if is_prose(s) and s != "Symponia":  # app name stays the app name
                hits.append((s, f"services/notifications.ts:"
                                f"{src[:m.start()].count(chr(10)) + 1}", "notification"))

    return hits


TEMPLATE_SAFE = re.compile(r"^\$\{[^}]*\}$")  # `${x}` alone: pure interpolation, no prose


def collect_template_literals():
    """Template literals that reach the screen.

    THIS CHECK EXISTS BECAUSE ITS ABSENCE SHIPPED A BUG.

    The audit used to prove only that every string literal HAD a dictionary key.
    It never asked whether the string that actually reaches t() at runtime is a
    literal at all. A template literal is assembled at runtime:

        `continue your last reflection · ${mode.title}`
        `${cap(dominant)}, dominant · ${cap(shadow)}, your shadow`

    The finished sentence exists nowhere in the source, so no key can ever match
    it, so t() returns the English fallback -- forever, silently, while the audit
    reports PASS. Both of the above shipped to TestFlight in English.

    A template literal carrying prose must be rewritten as an interpolated key:
        t('continue your last reflection · {mode}', { mode: t(title) })
    """
    hits = []
    files = glob.glob(os.path.join(ROOT, "app", "**", "*.tsx"), recursive=True)
    files += glob.glob(os.path.join(ROOT, "components", "*.tsx"))
    for path in files:
        src = open(path).read()
        rel = os.path.relpath(path, ROOT)
        for m in re.finditer(r"`([^`]*)`", src):
            body = m.group(1)
            if "${" not in body or TEMPLATE_SAFE.match(body.strip()):
                continue
            line = src[:m.start()].count(chr(10)) + 1
            lines = src.splitlines()
            line_src = lines[line - 1] if 0 <= line - 1 < len(lines) else ""

            # Not copy: developer logs, debug prefixes.
            if "console." in line_src or body.lstrip().startswith("["):
                continue

            # The prose fragments are whatever sits outside the ${...} holes.
            prose = " ".join(p.strip() for p in re.split(r"\$\{[^}]*\}", body)).strip()

            # Not copy: style values ('12deg'), cache keys ('symponia-drefl-'),
            # element ids ('bg'). Real copy is several words of actual language.
            words = [w for w in re.findall(r"[A-Za-z']{2,}", prose)]
            if len(words) < 3 or " " not in prose:
                continue
            if not is_prose(prose):
                continue
            hits.append((f"`{body}`", f"{rel}:{line}"))
    return hits


def main():
    renderable = collect_renderable()
    dicts = {l: read_dict_keys(l) for l in LANGS}

    missing = {}
    for s, locs in renderable.items():
        absent = [l for l in LANGS if s not in dicts[l]]
        if absent:
            missing[s] = (locs[0], absent)

    unwrapped = collect_unwrapped()
    unreachable = collect_unreachable()
    templates = collect_template_literals()

    print(f"renderable strings : {len(renderable)}")
    for l in LANGS:
        print(f"  {l}: {len(dicts[l]):4d} keys")

    if not missing and not unwrapped and not unreachable and not templates:
        print("\nOK - every renderable string is translated in all 8 languages.")
        return 0

    if templates:
        print(f"\nTEMPLATE LITERAL WITH PROSE  ({len(templates)}) -- the assembled "
              "string never exists in the source, so it can NEVER have a dict key "
              "and will render English forever. Rewrite as t('... {x} ...', {{ x }}):\n")
        for s, loc in sorted(set(templates)):
            print(f"  {s}\n        {loc}")

    if unreachable:
        print(f"\nUNREACHABLE  ({len(unreachable)}) -- prose inside a multi-child "
              "<Text>. A dict key will NOT help; split the JSX:\n")
        for s, loc, _ in sorted(set(unreachable)):
            print(f"  {s!r}\n        {loc}")

    if unwrapped:
        print(f"\nNOT WRAPPED IN t()  ({len(unwrapped)}) "
              "-- <Text> cannot see these, they will render English forever:\n")
        for s, loc, kind in sorted(unwrapped):
            print(f"  [{kind}] {s!r}\n        {loc}")

    if missing:
        print(f"\nMISSING FROM DICTS  ({len(missing)})\n")
        for s, (loc, absent) in sorted(missing.items()):
            tag = "ALL" if len(absent) == len(LANGS) else ",".join(absent)
            print(f"  [{tag}] {s!r}\n        {loc}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
