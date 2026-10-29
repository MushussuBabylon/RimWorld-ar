import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import reshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

const richTextTags = new Set([
  'b', 'i', 'size', 'color', 'material', 'quad', 'a', 'align', 'cspace', 'font', 
  'indent', 'line-height', 'line-indent', 'link', 'lowercase', 'uppercase', 
  'smallcaps', 'margin', 'mark', 'mspace', 'noparse', 'nobr', 'page', 'pos', 
  'space', 'sprite', 's', 'u', 'voffset', 'width'
]);

function isOpeningRichTextTag(tag: string): boolean {
  if (tag.startsWith('(*') && tag.endsWith(')')) return true;
  if (!tag.startsWith('<') || tag.startsWith('</') || tag.endsWith('/>')) return false;
  const tagNameMatch = tag.match(/^<([a-zA-Z0-9-]+)/);
  if (!tagNameMatch) return false;
  return richTextTags.has(tagNameMatch[1].toLowerCase());
}

function isClosingRichTextTag(tag: string): boolean {
  if (tag.startsWith('(/') && tag.endsWith(')')) return true;
  if (!tag.startsWith('</')) return false;
  const tagNameMatch = tag.match(/^<\/([a-zA-Z0-9-]+)>/);
  if (!tagNameMatch) return false;
  return richTextTags.has(tagNameMatch[1].toLowerCase());
}

function fixInvertedTags(text: string): string {
  const tokens: { type: 'text' | 'tag', value: string, name?: string, isOpening?: boolean, isClosing?: boolean }[] = [];
  let lastIndex = 0;
  const tagRegex = /<.*?>|\(\*.*?\)|\(\/.*?\)/g;
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.substring(lastIndex, match.index) });
    }
    
    const tag = match[0];
    const isClosing = isClosingRichTextTag(tag);
    const isOpening = isOpeningRichTextTag(tag);
    let name = '';
    if (isClosing) {
      if (tag.startsWith('(/')) {
        name = tag.substring(2, tag.length - 1).toLowerCase();
      } else {
        name = tag.match(/^<\/([a-zA-Z0-9-]+)>/)?.[1]?.toLowerCase() || '';
      }
    }
    if (isOpening) {
      if (tag.startsWith('(*')) {
        name = tag.substring(2, tag.length - 1).toLowerCase();
      } else {
        name = tag.match(/^<([a-zA-Z0-9-]+)/)?.[1]?.toLowerCase() || '';
      }
    }
    
    tokens.push({ type: 'tag', value: tag, name, isOpening, isClosing });
    lastIndex = match.index + tag.length;
  }
  
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.substring(lastIndex) });
  }

  const stack: number[] = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'tag' && t.isClosing) {
      stack.push(i);
    } else if (t.type === 'tag' && t.isOpening) {
      for (let j = stack.length - 1; j >= 0; j--) {
        const stackIndex = stack[j];
        if (tokens[stackIndex].name === t.name) {
          const temp = tokens[stackIndex].value;
          tokens[stackIndex].value = tokens[i].value;
          tokens[i].value = temp;
          
          tokens[stackIndex].isClosing = false;
          tokens[stackIndex].isOpening = true;
          tokens[i].isClosing = true;
          tokens[i].isOpening = false;
          
          stack.splice(j, 1);
          break;
        }
      }
    }
  }

  return tokens.map(t => t.value).join('');
}

export interface ProcessOptions {
  wrapLength: number;
  applyRtlFix: boolean;
  applyWordWrap: boolean;
}

// ---------------------------------------------------------------------------
// Visual-order helpers
// ---------------------------------------------------------------------------

const RTL_REGEX = /[\u0600-\u06FF\u0590-\u05FF\uFE70-\uFEFF\uFB50-\uFDFF]/;

// Everything that must pass through the game untouched (variables, rule references, rich-text tags, ...).
// Source kept as a string so it can be combined with SWITCH_SRC below (see buildPlaceholderRegex).
const PLACEHOLDER_SRC = String.raw`\(\{+[^{}]*\}+\)|\{+[^{}]*\}+|<.*?>|\(\*.*?\)|\(\/.*?\)|\-\>|\[.*?\]`;
// Same, but a "({KEY ? a : b})" is not swallowed whole - the switch inside it still has to be processed.
const PLACEHOLDER_SRC_SWITCH_AWARE = PLACEHOLDER_SRC.replace(
  String.raw`\(\{+[^{}]*\}+\)`,
  String.raw`\(\{+(?!\s*[A-Za-z0-9_]+\s*\?)[^{}]*\}+\)`
);

// Gender / plural switches:  {PAWN_gender ? he : she}   {OTHERPAWN_gender ? قتل : قتلت}
// {PAWNSALIVECOUNT_multiple ? a : b}  ... i.e. "{ KEY ? branch (: branch)* }".
// The game replaces the whole block with ONE branch at runtime, so every branch has to be stored in
// visual order (shaped + reversed) exactly like a normal line - it is NOT enough to leave it alone.
const SWITCH_SRC = String.raw`\{\s*[A-Za-z0-9_]+\s*\?[^{}]*\}`;
const SWITCH_BLOCK = /^\{(\s*[A-Za-z0-9_]+\s*\?)([^{}]*)\}$/;

function buildPlaceholderRegex(withSwitches: boolean): RegExp {
  return new RegExp(withSwitches ? `${SWITCH_SRC}|${PLACEHOLDER_SRC_SWITCH_AWARE}` : PLACEHOLDER_SRC, 'g');
}

// Markers that stand in for a finished switch block while the line is word-wrapped / reordered.
// They are right-to-left letters (Thaana + Syriac, never used in game text) so that the block is ordered
// like Arabic text next to other placeholders. The ordinary placeholder markers (U+E000..) are left-to-right,
// which is right for names / numbers but would keep "[PAWN_nameDef] {PAWN_gender ? ..}" in the wrong order.
const SWITCH_MARKER_POOL: string[] = [];
for (let c = 0x0780; c <= 0x07A5; c++) SWITCH_MARKER_POOL.push(String.fromCharCode(c));
for (let c = 0x0712; c <= 0x072F; c++) SWITCH_MARKER_POOL.push(String.fromCharCode(c));
const SWITCH_MARKER_CLASS = /[\u0712-\u072F\u0780-\u07A5]/g;

/** Reorders one already-shaped, placeholder-free line into the visual (left-to-right drawing) order. */
function toVisualOrder(subLine: string): string {
  const embeddingLevels = bidi.getEmbeddingLevels(subLine, 'rtl');
  const flips = bidi.getReorderSegments(subLine, embeddingLevels);
  
  let outputArr = subLine.split('');
  for (const flip of flips) {
    const start = flip[0];
    const end = flip[1];
    const reversed = outputArr.slice(start, end + 1).reverse();
    for (let i = 0; i < reversed.length; i++) {
      outputArr[start + i] = reversed[i];
    }
  }
  
  let visualStr = "";
  for (let j = 0; j < outputArr.length; j++) {
    let char = outputArr[j];
    const mirrored = bidi.getMirroredCharacter(char);
    visualStr += mirrored || char;
  }

  return visualStr;
}

/** One branch of a switch (text between '?' / ':' / '}'), already shaped. Keeps its surrounding spaces. */
function branchToVisualOrder(branch: string): string {
  const core = branch.trim();
  if (!core || !RTL_REGEX.test(core)) return branch; // e.g. leftover English "have"/"Boy": nothing to fix
  const lead = branch.substring(0, branch.indexOf(core));
  const trail = branch.substring(lead.length + core.length);

  // Protect nested [rule refs], <tags>, (*tags) etc. exactly like the main line does.
  const inner: string[] = [];
  const withMarkers = core.replace(buildPlaceholderRegex(false), (m) => {
    inner.push(m);
    return String.fromCharCode(0xE000 + inner.length - 1);
  });
  const visual = toVisualOrder(withMarkers).replace(/[\uE000-\uF8FF]/g, (m) => inner[m.charCodeAt(0) - 0xE000]);
  return lead + visual + trail;
}

/** "{KEY ? a : b}" -> same block with every branch in visual order. The "{KEY ? ... : ...}" skeleton is kept. */
function switchToVisualOrder(block: string): string {
  const m = block.match(SWITCH_BLOCK);
  if (!m) return block;
  const [, head, body] = m;
  return `{${head}${body.split(':').map(branchToVisualOrder).join(':')}}`;
}

export function processText(text: string, options: Partial<ProcessOptions> = {}): string {
  const { wrapLength = 30, applyRtlFix = true, applyWordWrap = true } = options;
  if (!text || typeof text !== 'string') return text;

  // Split by \n or literal \n, keeping the delimiters
  const parts = text.split(/(\\n|\r\n|\n)/);

  for (let i = 0; i < parts.length; i += 2) {
    let line = parts[i];
    if (!line) continue;

    const hasRtl = RTL_REGEX.test(line);

    let prefix = '';
    if (hasRtl) {
      const prefixRegex = /^([^\u0600-\u06FF\u0590-\u05FF\uFE70-\uFEFF\uFB50-\uFDFF]+?->)/;
      const prefixMatch = line.match(prefixRegex);
      if (prefixMatch) {
        prefix = prefixMatch[1];
        line = line.substring(prefix.length);
      }
    }

    const tags: string[] = [];
    let markerIndex = 0;
    
    let processedLine = applyRtlFix && hasRtl ? reshaper.convertArabic(line) : line;

    const shouldWordWrap = applyWordWrap && wrapLength > 0 && hasRtl;

    const needProcessing = (applyRtlFix && hasRtl) || shouldWordWrap;
    
    if (!needProcessing) {
      parts[i] = prefix + processedLine;
      continue;
    }

    // Switch blocks are only rewritten when the RTL fix is on; otherwise they stay plain placeholders.
    const handleSwitches = applyRtlFix && hasRtl;
    const freeSwitchMarkers = SWITCH_MARKER_POOL.filter(ch => !processedLine.includes(ch));
    const switchBlocks = new Map<string, string>();

    const lineWithMarkers = processedLine.replace(buildPlaceholderRegex(handleSwitches), (match) => {
      if (handleSwitches && SWITCH_BLOCK.test(match) && freeSwitchMarkers.length > 0) {
        const marker = freeSwitchMarkers.shift()!;
        switchBlocks.set(marker, switchToVisualOrder(match));
        return marker;
      }
      tags.push(match);
      return String.fromCharCode(0xE000 + markerIndex++);
    });

    let wrappedLine = lineWithMarkers;
    if (shouldWordWrap) {
      const words = lineWithMarkers.split(/\s+/).filter(w => w.length > 0);
      const wrappedLines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        if (currentLine.length + word.length + 1 > wrapLength) {
          if (currentLine.length > 0) {
            wrappedLines.push(currentLine);
            currentLine = word;
          } else {
            wrappedLines.push(word);
            currentLine = '';
          }
        } else {
          if (currentLine.length > 0) {
            currentLine += ' ';
          }
          currentLine += word;
        }
      }
      if (currentLine.length > 0) {
        wrappedLines.push(currentLine);
      }
      wrappedLine = wrappedLines.join('\n');
    }

    const subLines = wrappedLine.split('\n');
    let reversedSubLines = subLines;

    if (applyRtlFix && hasRtl) {
      reversedSubLines = subLines.map(toVisualOrder);
    }

    let finalLine = reversedSubLines.join('\\n');

    finalLine = finalLine.replace(/[\uE000-\uF8FF]/g, (match) => {
      const index = match.charCodeAt(0) - 0xE000;
      return tags[index];
    });
    if (switchBlocks.size > 0) {
      finalLine = finalLine.replace(SWITCH_MARKER_CLASS, (m) => switchBlocks.get(m) ?? m);
    }

    if (applyRtlFix && hasRtl) {
      finalLine = fixInvertedTags(finalLine);
    }
    
    parts[i] = prefix + finalLine;
  }

  return parts.join('');
}

export function processXml(xmlString: string, options: Partial<ProcessOptions> = {}): string {
  const dictionaryFixes: Record<string, string> = {
    'PickUpCount': '{1_labelShort} x{{0}} التقاط',
    'GiveToPackAnimalCount': 'تحميل {1_labelShort} x{{0}} على حيوان الحمل',
    'LoadIntoCaravanCount': '{1_labelShort} x{{0}} تحميل',
    'CommandToggleAllowAutoRefuelDesc': 'يحدد هذا ما إذا كان المستعمرون سيعيدون تزويد هذا بالوقود تلقائيًا. إذا تم التمكين، سيملأ المستعمرون هذا حتى {0}.\n\nإعادة التزود بالوقود التلقائي حاليا {ONOFF}.',
    'RemoveSliderText': '{{0}}x {0} إزالة',
    'AlreadyLearned': 'لقد تعلم {USER_labelShort} بالفعل {1}',
    'AbandonSliderText': '{{0}}x {0} تخلى',
  };

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  
  const parseError = doc.getElementsByTagName("parsererror");
  if (parseError && parseError.length > 0) {
    console.warn("XML parsing error, skipping file.");
    return xmlString;
  }

  // Intercept the tags from dictionary
  for (const [tag, fix] of Object.entries(dictionaryFixes)) {
    const nodes = doc.getElementsByTagName(tag);
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i] && nodes[i].childNodes.length > 0) {
        nodes[i].textContent = fix;
      }
    }
  }

  function processLeafNodes(node: any) {
    if (node.childNodes && node.childNodes.length > 0) {
      let hasElementChild = false;
      for (let i = 0; i < node.childNodes.length; i++) {
        if (node.childNodes[i].nodeType === 1) {
          hasElementChild = true;
          processLeafNodes(node.childNodes[i]);
        }
      }
      if (!hasElementChild && node.textContent) {
        node.textContent = processText(node.textContent.trim(), options).trim();
      }
    }
  }
  processLeafNodes(doc.documentElement);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}
