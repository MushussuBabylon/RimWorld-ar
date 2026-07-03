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

export function processText(text: string, options: Partial<ProcessOptions> = {}): string {
  const { wrapLength = 30, applyRtlFix = true, applyWordWrap = true } = options;
  if (!text || typeof text !== 'string') return text;

  // Split by \n or literal \n, keeping the delimiters
  const parts = text.split(/(\\n|\r\n|\n)/);

  for (let i = 0; i < parts.length; i += 2) {
    let line = parts[i];
    if (!line) continue;

    const rtlRegex = /[\u0600-\u06FF\u0590-\u05FF\uFE70-\uFEFF\uFB50-\uFDFF]/;
    const hasRtl = rtlRegex.test(line);

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
    const placeholderRegex = /\{+[^{}]*\}+|<.*?>|\(\*.*?\)|\(\/.*?\)|\-\>|\[.*?\]/g;
    let markerIndex = 0;
    
    let processedLine = applyRtlFix && hasRtl ? reshaper.convertArabic(line) : line;

    const shouldWordWrap = applyWordWrap && wrapLength > 0 && hasRtl;

    const needProcessing = (applyRtlFix && hasRtl) || shouldWordWrap;
    
    if (!needProcessing) {
      parts[i] = prefix + processedLine;
      continue;
    }

    const lineWithMarkers = processedLine.replace(placeholderRegex, (match) => {
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
      reversedSubLines = subLines.map(subLine => {
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
      });
    }

    let finalLine = reversedSubLines.join('\\n');

    finalLine = finalLine.replace(/[\uE000-\uF8FF]/g, (match) => {
      const index = match.charCodeAt(0) - 0xE000;
      return tags[index];
    });

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
