import * as fs from 'fs';
import * as path from 'path';
import { processXml, processText, ProcessOptions } from './process';

const KNOWN_DLCS = [
    'Core',
    'Royalty',
    'Ideology',
    'Biotech',
    'Anomaly',
    'Odyssey'
];

/**
 * Recursively gets every file inside a directory.
 */
function getAllFiles(dir: string): string[] {
    const results: string[] = [];

    const entries = fs.readdirSync(dir, {
        withFileTypes: true
    });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results.push(...getAllFiles(fullPath));
        } else {
            results.push(fullPath);
        }
    }

    return results;
}

/**
 * Recursively copies a directory.
 */
function copyDir(src: string, dest: string): void {
    fs.mkdirSync(dest, {
        recursive: true
    });

    const entries = fs.readdirSync(src, {
        withFileTypes: true
    });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Processes all translation files into a Data folder.
 */
function processDirectory(
    inputDir: string,
    outputDir: string,
    baseOptions: Partial<ProcessOptions>
): void {
    if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, {
            recursive: true,
            force: true
        });
    }

    copyDir(inputDir, outputDir);

    const allFiles = getAllFiles(outputDir);

    for (const file of allFiles) {
        const ext = path.extname(file).toLowerCase();

        const lowerPath = file
            .toLowerCase()
            .replace(/\\/g, '/');

        if (ext === '.txt') {
            // TXT files: always RTL fix only, never word wrap
            const content = fs.readFileSync(file, 'utf-8');

            const processed = processText(content, {
                wrapLength: 0,
                applyRtlFix: true,
                applyWordWrap: false
            });

            fs.writeFileSync(file, processed, 'utf-8');

            console.log(`  [TXT] Processed: ${file}`);
        }
        else if (ext === '.xml') {
            const content = fs.readFileSync(file, 'utf-8');

            // Copy base options so individual files can override them.
            const options: Partial<ProcessOptions> = {
                ...baseOptions
            };

            // Per-file exceptions.
            const isTipsXml =
                lowerPath.endsWith('tips.xml');

            const isIdeoPresetDefsXml =
                lowerPath.includes('ideopresetcategorydef') &&
                lowerPath.endsWith('ideopresetdefs.xml');

            const isDesignatorsXml =
                lowerPath.includes('data/core/languages') &&
                lowerPath.includes('keyed') &&
                lowerPath.endsWith('designators.xml');

            // Matches Messages.xml inside any Keyed folder.
            const isMessagesXml =
                lowerPath.includes('/keyed/') &&
                lowerPath.endsWith('messages.xml');

            if (isTipsXml) {
                options.applyWordWrap = true;
                options.wrapLength = 100;
            }
            else if (isMessagesXml) {
                options.applyWordWrap = true;
                options.wrapLength = 110;
            }
            else if (isIdeoPresetDefsXml) {
                options.applyWordWrap = true;
                options.wrapLength = 50;
            }
            else if (isDesignatorsXml) {
                options.applyWordWrap = true;
                options.wrapLength = 25;
            }

            try {
                const processed = processXml(content, options);

                fs.writeFileSync(
                    file,
                    processed,
                    'utf-8'
                );

                console.log(`  [XML] Processed: ${file}`);
            }
            catch (err) {
                console.error(
                    `  [ERROR] Skipping ${file}:`,
                    err
                );
            }
        }
    }
}

/**
 * Copies the ArabicSupport mod.
 */
function copyModDirectory(
    inputDir: string,
    outputDir: string
): void {
    if (!fs.existsSync(inputDir)) {
        console.error(
            `  [ERROR] Mod source folder not found: ${inputDir}`
        );

        return;
    }

    if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, {
            recursive: true,
            force: true
        });
    }

    copyDir(inputDir, outputDir);

    console.log(
        `  [MOD] Copied: ${inputDir} -> ${outputDir}`
    );
}

/**
 * Removes DLC prefixes from .txt filenames.
 *
 * Example:
 *   Biotech_plants.txt -> plants.txt
 *   Royalty*plants.txt -> plants.txt
 */
function stripDlcPrefix(filename: string): string {
    for (const dlc of KNOWN_DLCS) {
        const escapedDlc = dlc.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        );

        const pattern = new RegExp(
            `^${escapedDlc}[_*\\-]*`,
            'i'
        );

        if (pattern.test(filename)) {
            return filename.replace(pattern, '');
        }
    }

    return filename;
}

/**
 * Normalizes a known expansion name.
 */
function normalizeExpansion(expansion: string): string {
    for (const dlc of KNOWN_DLCS) {
        if (dlc.toLowerCase() === expansion.toLowerCase()) {
            return dlc;
        }
    }

    return expansion;
}

/**
 * Calculates the destination path inside:
 *
 * Languages/Arabic/
 *
 * XML files are prefixed with their DLC name to prevent collisions.
 * TXT files keep the exact names expected by RimWorld.
 */
function getDestinationRelPath(
    expansion: string,
    relSubPath: string
): string {
    const normalized = relSubPath
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');

    const lower = normalized.toLowerCase();

    // Root language files remain directly inside Arabic/.
    if (
        lower === 'languageinfo.xml' ||
        lower === 'langicon.png'
    ) {
        return normalized;
    }

    const parts = normalized.split('/');

    const rawFileName = parts[parts.length - 1];

    const dirPath = parts
        .slice(0, -1)
        .join('/');

    const isText =
        rawFileName.toLowerCase().endsWith('.txt');

    // =========================================================
    // TXT FILES
    // =========================================================

    if (isText) {
        const lowerDir = dirPath.toLowerCase();
        const lowerFile = rawFileName.toLowerCase();

        // WordInfo files require exact RimWorld filenames.
        if (
            lowerDir === 'wordinfo' ||
            lowerDir.startsWith('wordinfo/')
        ) {
            if (lowerFile.includes('plural.txt')) {
                return 'WordInfo/plural.txt';
            }

            if (
                lowerFile.includes('case.txt') ||
                lowerFile.includes('decline.txt')
            ) {
                return 'WordInfo/decline.txt';
            }

            if (lowerFile.includes('imperfect.txt')) {
                return 'WordInfo/Imperfect.txt';
            }

            if (
                lowerFile.includes(
                    'skilldef_subject.txt'
                )
            ) {
                return 'WordInfo/SkillDef_subject.txt';
            }

            const clean = stripDlcPrefix(rawFileName);

            return dirPath
                ? `${dirPath}/${clean}`
                : `WordInfo/${clean}`;
        }

        // Strings and Name Banks.
        const clean = stripDlcPrefix(rawFileName);

        return dirPath
            ? `${dirPath}/${clean}`
            : clean;
    }

    // =========================================================
    // XML FILES
    // =========================================================

    const normalizedExpansion =
        normalizeExpansion(expansion);

    const escapedExpansion =
        normalizedExpansion.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        );

    const startsWithDlc = new RegExp(
        `^${escapedExpansion}[_*\\-]`,
        'i'
    ).test(rawFileName);

    const finalFileName = startsWithDlc
        ? rawFileName
        : `${normalizedExpansion}_${rawFileName}`;

    return dirPath
        ? `${dirPath}/${finalFileName}`
        : finalFileName;
}

/**
 * Extracts the DLC expansion and language-relative path
 * from a processed Data directory.
 *
 * Supports:
 *
 * Data/Core/Languages/Arabic/...
 * Data/Royalty/Languages/Arabic/...
 * Data/Languages/Arabic/...
 * Core/Languages/Arabic/...
 * Languages/Arabic/...
 */
function getTranslationSourceInfo(
    inputRoot: string,
    filePath: string
): {
    expansion: string;
    relSubPath: string;
} | null {
    const rawRel = path
        .relative(inputRoot, filePath)
        .replace(/\\/g, '/');

    let match = rawRel.match(
        /^([^/]+)\/Languages\/Arabic\/(.+)$/i
    );

    if (match) {
        return {
            expansion: normalizeExpansion(match[1]),
            relSubPath: match[2]
        };
    }

    match = rawRel.match(
        /^Languages\/Arabic\/(.+)$/i
    );

    if (match) {
        return {
            expansion: 'Core',
            relSubPath: match[1]
        };
    }

    match = rawRel.match(
        /^([^/]+)\/Arabic\/(.+)$/i
    );

    if (match) {
        return {
            expansion: normalizeExpansion(match[1]),
            relSubPath: match[2]
        };
    }

    // Direct Core-style paths.
    if (
        rawRel.startsWith('DefInjected/') ||
        rawRel.startsWith('Keyed/') ||
        rawRel.startsWith('Strings/') ||
        rawRel.startsWith('WordInfo/') ||
        rawRel.toLowerCase() === 'languageinfo.xml' ||
        rawRel.toLowerCase() === 'langicon.png'
    ) {
        return {
            expansion: 'Core',
            relSubPath: rawRel
        };
    }

    return null;
}

/**
 * Builds:
 *
 * ArabicSupport/Languages/Arabic/
 *
 * directly from the processed Data-ArabicSupport/Data folder.
 *
 * TXT files are merged line-by-line without duplicates.
 * XML and assets are copied into their final locations.
 */
function buildLanguages(
    inputRootDir: string,
    outputLanguagesDir: string
): void {
    if (!fs.existsSync(inputRootDir)) {
        throw new Error(
            `Translation source directory does not exist: ${inputRootDir}`
        );
    }

    const outputArabicDir = path.join(
        outputLanguagesDir,
        'Arabic'
    );

    // Remove old generated Languages/Arabic output.
    if (fs.existsSync(outputArabicDir)) {
        fs.rmSync(outputArabicDir, {
            recursive: true,
            force: true
        });
    }

    fs.mkdirSync(outputArabicDir, {
        recursive: true
    });

    /**
     * TXT destination:
     * {
     *   "WordInfo/plural.txt": ["line1", "line2"]
     * }
     */
    const textFileLines =
        new Map<string, string[]>();

    /**
     * XML / binary destination:
     * {
     *   "DefInjected/ThingDef/Core_Things.xml": sourcePath
     * }
     */
    const directFiles =
        new Map<string, string>();

    const files = getAllFiles(inputRootDir);

    for (const filePath of files) {
        const sourceInfo =
            getTranslationSourceInfo(
                inputRootDir,
                filePath
            );

        if (!sourceInfo) {
            continue;
        }

        const expansion =
            normalizeExpansion(
                sourceInfo.expansion
            );

        const destRel =
            getDestinationRelPath(
                expansion,
                sourceInfo.relSubPath
            );

        const isText =
            destRel.toLowerCase()
                .endsWith('.txt');

        // =====================================================
        // Merge TXT files
        // =====================================================

        if (isText) {
            if (!textFileLines.has(destRel)) {
                textFileLines.set(
                    destRel,
                    []
                );
            }

            const lines =
                textFileLines.get(destRel)!;

            const existingLines =
                new Set(lines);

            const content =
                fs.readFileSync(
                    filePath,
                    'utf-8'
                );

            for (
                const line of content.split(/\r?\n/)
            ) {
                const trimmed =
                    line.trim();

                if (
                    trimmed &&
                    !existingLines.has(trimmed)
                ) {
                    lines.push(trimmed);
                    existingLines.add(trimmed);
                }
            }
        }

        // =====================================================
        // Copy XML / PNG / other files
        // =====================================================

        else {
            directFiles.set(
                destRel,
                filePath
            );
        }
    }

    // =========================================================
    // Write merged TXT files
    // =========================================================

    for (
        const [destRel, lines]
        of textFileLines
    ) {
        const destFull = path.join(
            outputArabicDir,
            ...destRel.split('/')
        );

        fs.mkdirSync(
            path.dirname(destFull),
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            destFull,
            lines.join('\n') + '\n',
            'utf-8'
        );
    }

    // =========================================================
    // Copy XML and assets
    // =========================================================

    for (
        const [destRel, srcPath]
        of directFiles
    ) {
        const destFull = path.join(
            outputArabicDir,
            ...destRel.split('/')
        );

        fs.mkdirSync(
            path.dirname(destFull),
            {
                recursive: true
            }
        );

        fs.copyFileSync(
            srcPath,
            destFull
        );
    }

    console.log(
        `  [LANGUAGES] Successfully created: ${outputArabicDir}`
    );

    console.log(
        `  [LANGUAGES] XML/Asset files: ${directFiles.size}`
    );

    console.log(
        `  [LANGUAGES] Merged TXT banks: ${textFileLines.size}`
    );
}


// =============================================================
// BUILD
// =============================================================

const dataDir = path.resolve(
    __dirname,
    '../Data'
);

const modsDir = path.resolve(
    __dirname,
    '../Mods'
);

const outDir = path.resolve(
    __dirname,
    '../dist'
);

fs.mkdirSync(outDir, {
    recursive: true
});


// =============================================================
// 1. DATA-NORMAL
// =============================================================

console.log(
    '\n[1/3] Building Data-Normal (RTL fix only)...'
);

processDirectory(
    dataDir,
    path.join(
        outDir,
        'Data-Normal',
        'Data'
    ),
    {
        applyRtlFix: true,
        applyWordWrap: false,
        wrapLength: 30
    }
);


// =============================================================
// 2. DATA-WORDWRAP
// =============================================================

console.log(
    '\n[2/3] Building Data-WordWrap (RTL fix + word wrap)...'
);

processDirectory(
    dataDir,
    path.join(
        outDir,
        'Data-WordWrap',
        'Data'
    ),
    {
        applyRtlFix: true,
        applyWordWrap: true,
        wrapLength: 30
    }
);


// =============================================================
// 3. DATA-ARABICSUPPORT
// =============================================================

console.log(
    '\n[3/3] Building Data-ArabicSupport...'
);

const arabicSupportRoot = path.join(
    outDir,
    'Data-ArabicSupport'
);

const temporaryProcessedDataDir = path.join(
    arabicSupportRoot,
    'Data'
);

const arabicSupportModDir = path.join(
    arabicSupportRoot,
    'Mods',
    'ArabicSupport'
);

// Step 1:
// Process Data normally into a temporary folder.
console.log(
    '  [ARABICSUPPORT] Processing translation files...'
);

processDirectory(
    dataDir,
    temporaryProcessedDataDir,
    {
        applyRtlFix: true,
        applyWordWrap: false,
        wrapLength: 30
    }
);

// Step 2:
// Copy ArabicSupport mod.
console.log(
    '  [ARABICSUPPORT] Copying ArabicSupport mod...'
);

copyModDirectory(
    path.join(
        modsDir,
        'ArabicSupport'
    ),
    arabicSupportModDir
);

// Step 3:
// Build Languages/Arabic directly inside the mod.
console.log(
    '  [ARABICSUPPORT] Building Languages/Arabic...'
);

buildLanguages(
    temporaryProcessedDataDir,
    path.join(
        arabicSupportModDir,
        'Languages'
    )
);

// Step 4:
// Data is now unnecessary because everything required
// was merged into ArabicSupport/Languages.
console.log(
    '  [ARABICSUPPORT] Deleting unnecessary temporary Data folder...'
);

if (fs.existsSync(temporaryProcessedDataDir)) {
    fs.rmSync(
        temporaryProcessedDataDir,
        {
            recursive: true,
            force: true
        }
    );
}

console.log(
    '\n✅ All variants built successfully in /dist/'
);

console.log(
    '📦 Data-ArabicSupport structure:'
);

console.log(
    '   Mods/ArabicSupport/About'
);

console.log(
    '   Mods/ArabicSupport/Assemblies'
);

console.log(
    '   Mods/ArabicSupport/Languages/Arabic'
);
