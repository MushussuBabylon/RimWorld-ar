# Third-party notices

Arabic Auto Translation contains, or is built from, the work of others. Their licences apply to those parts. The mod as a
whole is distributed under the GNU General Public License, version 3 (`LICENSE`, unchanged).

## Auto Translation - the code this mod is built from

| | |
|---|---|
| Author | SeoHyeon |
| Source code | https://github.com/csh1668/AutoTranslation |
| Steam Workshop | https://steamcommunity.com/sharedfiles/filedetails/?id=3278005460 |
| Licence | GNU General Public License v3 (full text in `LICENSE`) |
| Copyright notice | "Copyright (c) 2024", kept in `Source/ArabicAutoTranslation/Properties/AssemblyInfo.cs` |

This is a **modified version** of that work (GPL-3.0, section 5a), modified in 2026:

* **Added:** Arabic support (`Source/ArabicAutoTranslation/Arabic/`, `Arabic/ArabicGlossary.txt`), an Arabic text for the mod's
  own interface (`Languages/Arabic`), new artwork (`About/Preview.png`, `About/ModIcon.png`), tests, tools and the build files.
* **Changed:** the mod was renamed to Arabic Auto Translation (namespace, assembly and folder names), the source files that
  call the Arabic code, the English language file, `About/About.xml` and the Harmony id.
* **Removed:** the Korean localization, Korean comments and strings (replaced by English), the prebuilt `AutoTranslation.dll` files and `About/PublishedFileId.txt`.

## LunaTranslator - Yandex provider

`Source/ArabicAutoTranslation/Translators/Translator_Yandex.cs` is ported from `src/LunaTranslator/translator/yandex.py` of
**LunaTranslator** by HIllya51 (https://github.com/HIllya51/LunaTranslator, GNU General Public License v3.0). The Papago
provider (`Translator_Papago.cs`, disabled) comes from the same project.

## Harmony

`1.4/Assemblies`, `1.5/Assemblies` and `1.6/Assemblies` contain `0Harmony.dll` as it came with the base mod (file versions
2.2.2.0, 2.3.3.0 and 2.4.1.0). Author: Andreas Pardeike, https://github.com/pardeike/Harmony, MIT licence, "Copyright (c)
2016". For RimWorld 1.7 Harmony is not included; it is a mod dependency (`About/About.xml`).

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation
> files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy,
> modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
> ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Unicode data

`Source/ArabicAutoTranslation/Arabic/Core/ArabicTables.cs` is generated from the Unicode Character Database, version 15.1
(bidirectional classes, joining types, mirroring and bracket pairs). Unicode is a registered trademark of Unicode, Inc.;
the data is used under the Unicode terms of use (https://www.unicode.org/terms_of_use.html, licence text:
https://www.unicode.org/license.txt). The Unicode Bidirectional Algorithm (UAX #9) and the Arabic joining rules were
implemented for this mod from the published specifications; no third-party implementation was copied.

## Other

* `Arabic/ArabicGlossary.txt` was built from a RimWorld terminology list supplied for this project; the list does not say
  where it comes from.
* The Yandex provider sends the texts to translate to Yandex's online translation service; Yandex's terms of use apply.
  If Yandex keeps refusing the requests and the option to switch automatically is on (it is by default), the texts of the
  rest of that game session are sent to Google's online translation service instead; Google's terms of use apply.
* RimWorld is a game by Ludeon Studios. This mod is not affiliated with Ludeon Studios and contains no game files.
