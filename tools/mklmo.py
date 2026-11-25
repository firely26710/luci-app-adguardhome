#!/usr/bin/env python3
"""Compile a gettext .po file into the .lmo catalog format used by LuCI.

Usage:
    python3 tools/mklmo.py po/zh-cn/luci-app-adguardhome.po \
        i18n/luci-app-adguardhome.zh-cn.lmo

The format is the one written by luci-base's po2lmo:
    [value strings, each NUL-padded to 4 bytes]
    [index: (key_id, plural+1, offset, length) as big-endian uint32, sorted]
    [uint32: offset of the index]

key_id is the 32-bit "sfh" hash of the msgid (optionally with context),
the same hash LuCI's JavaScript uses for window.TR lookups.
"""
import struct
import sys


def sfh(s):
    b = s.encode('utf-8')
    if not b:
        return None

    def u16(o):
        return b[o] | (b[o + 1] << 8)

    def s8(o):
        return b[o] - 256 if b[o] >= 128 else b[o]

    h = len(b)
    words = len(b) >> 2
    off = 0
    for _ in range(words):
        h = (h + u16(off)) & 0xffffffff
        tmp = (((u16(off + 2) << 11) & 0xffffffff) ^ h) & 0xffffffff
        h = (((h << 16) & 0xffffffff) ^ tmp) & 0xffffffff
        h = (h + (h >> 11)) & 0xffffffff
        off += 4
    rem = len(b) & 3
    if rem == 3:
        h = (h + u16(off)) & 0xffffffff
        h = (h ^ ((h << 16) & 0xffffffff)) & 0xffffffff
        h = (h ^ ((s8(off + 2) << 18) & 0xffffffff)) & 0xffffffff
        h = (h + (h >> 11)) & 0xffffffff
    elif rem == 2:
        h = (h + u16(off)) & 0xffffffff
        h = (h ^ ((h << 11) & 0xffffffff)) & 0xffffffff
        h = (h + (h >> 17)) & 0xffffffff
    elif rem == 1:
        h = (h + s8(off)) & 0xffffffff
        h = (h ^ ((h << 10) & 0xffffffff)) & 0xffffffff
        h = (h + (h >> 1)) & 0xffffffff
    h = (h ^ ((h << 3) & 0xffffffff)) & 0xffffffff
    h = (h + (h >> 5)) & 0xffffffff
    h = (h ^ ((h << 4) & 0xffffffff)) & 0xffffffff
    h = (h + (h >> 17)) & 0xffffffff
    h = (h ^ ((h << 25) & 0xffffffff)) & 0xffffffff
    h = (h + (h >> 6)) & 0xffffffff
    return h


def unescape(v):
    out = []
    i = 0
    while i < len(v):
        c = v[i]
        if c == '\\' and i + 1 < len(v):
            n = v[i + 1]
            out.append({'n': '\n', 't': '\t', '"': '"', '\\': '\\'}.get(n, n))
            i += 2
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def parse_po(path):
    entries = []
    cur = None
    field = None

    def flush():
        nonlocal cur, field
        if cur and cur.get('id') is not None and cur.get('str') is not None:
            entries.append((cur['id'], cur['str']))
        cur = None
        field = None

    for raw in open(path, encoding='utf-8'):
        line = raw.rstrip('\n')
        if not line.strip() or line.startswith('#'):
            flush()
            continue
        if line.startswith('msgid '):
            flush()
            cur = {'id': unescape(line[6:].strip().strip('"')), 'str': None}
            field = 'id'
        elif line.startswith('msgstr '):
            cur['str'] = unescape(line[7:].strip().strip('"'))
            field = 'str'
        elif line.startswith('msgid_plural') or line.startswith('msgstr['):
            # plural forms are not used by this catalog
            continue
        elif line.startswith('"'):
            val = unescape(line.strip().strip('"'))
            if field == 'id':
                cur['id'] += val
            else:
                cur['str'] = (cur['str'] or '') + val
    flush()
    return entries


def build(entries):
    plural = None
    pairs = []
    for msgid, msgstr in entries:
        if msgid == '':
            for line in msgstr.split('\n'):
                if line.lower().startswith('plural-forms:'):
                    plural = line.split(':', 1)[1].strip()
            continue
        if msgstr:
            pairs.append((msgid, msgstr))

    values = bytearray()
    index = []

    def add(key_hash, plural_id, text):
        off = len(values)
        raw = text.encode('utf-8')
        values.extend(raw)
        values.extend(b'\0' * ((-len(raw)) % 4))
        index.append((key_hash, plural_id, off, len(raw)))

    if plural:
        add(0, 0, plural)
    for msgid, msgstr in pairs:
        kh = sfh(msgid)
        if kh is None or kh == sfh(msgstr):
            continue
        add(kh, 1, msgstr)

    index.sort(key=lambda e: e[0])
    out = bytearray(values)
    for kh, pid, off, ln in index:
        out.extend(struct.pack('>IIII', kh, pid, off, ln))
    out.extend(struct.pack('>I', len(values)))
    return bytes(out), len(index)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    entries = parse_po(sys.argv[1])
    data, count = build(entries)
    with open(sys.argv[2], 'wb') as f:
        f.write(data)
    print('wrote %s: %d entries, %d bytes' % (sys.argv[2], count, len(data)))


if __name__ == '__main__':
    main()