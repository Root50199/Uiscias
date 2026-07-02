import * as fs from 'fs';
import * as path from 'path';
import * as readlineSync from 'readline-sync';

// Local, compile-safe helper function to escape string characters for RegExp
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runPreciseModPipeline() {
  console.log('=== MABINOGI PLEIONE XML GENERIC MODDER ===');

  const rawInput = readlineSync.question(
    'Enter path to target XML file (e.g., ./production.xml): ',
  );
  const inputPath = rawInput.trim().replace(/^["']|["']$/g, '');

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Error: File not found at '${inputPath}'`);
    return;
  }

  const targetAttribute = readlineSync
    .question('Which attribute/tag key would you like to edit/insert? (e.g., MaxAutoProduction): ')
    .trim();
  const newValue = readlineSync
    .question(`What value should be assigned to '${targetAttribute}'? `)
    .trim();

  if (!targetAttribute) {
    console.error('❌ Error: Target attribute key cannot be blank.');
    return;
  }

  try {
    // 1. Read the file as a raw binary buffer
    const buffer = fs.readFileSync(inputPath);
    let rawXmlString = '';

    // 2. Safely handle UTF-16 Little Endian BOM (0xFF, 0xFE) vs UTF-8
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      rawXmlString = buffer.toString('utf-16le');
    } else {
      rawXmlString = buffer.toString('utf-8');
    }

    let structuralChangesCounter = 0;

    // 3. Match any valid XML tag opening block
    const tagRegex = /(<[A-Za-z0-9_\:[\]]+)(\s+[^>]*?)(\s*\/?>)/g;

    const finalizedOutputDataStream = rawXmlString.replace(
      tagRegex,
      (match: string, tagOpen: string, attributeString: string, tagClose: string) => {
        // Check if this attribute already exists in this tag block
        const attrRegex = new RegExp(
          `\\b${escapeRegExp(targetAttribute)}\\s*=\\s*(['"])(.*?)\\1`,
          'g',
        );

        let updatedAttributeString = attributeString;

        if (attrRegex.test(attributeString)) {
          // Case A: The attribute exists. Replace its value precisely.
          updatedAttributeString = attributeString.replace(
            attrRegex,
            (attrMatch: string, quote: string) => {
              // Check if we are actually changing the value to avoid false counters
              const valCheckRegex = new RegExp(
                `\\b${escapeRegExp(targetAttribute)}\\s*=\\s*(['"])${escapeRegExp(newValue)}\\1`,
              );
              if (!valCheckRegex.test(attrMatch)) {
                structuralChangesCounter++;
              }
              return `${targetAttribute}=${quote}${newValue}${quote}`;
            },
          );
        } else {
          // Case B: The attribute is missing. Inject it right at the end of the existing attributes block.
          structuralChangesCounter++;
          updatedAttributeString = `${attributeString} ${targetAttribute}="${newValue}"`;
        }

        return `${tagOpen}${updatedAttributeString}${tagClose}`;
      },
    );

    if (structuralChangesCounter === 0) {
      console.log(
        'ℹ️ No operational adjustments needed. Every matching node parameter already shares that identical value.',
      );
      return;
    }

    // 4. Convert the string back to a clean UTF-16LE buffer and attach the mandatory 0xFFFE BOM prefix
    const xmlBuffer = Buffer.from(finalizedOutputDataStream, 'utf-16le');
    const bomBuffer = Buffer.from([0xff, 0xfe]);
    const filePayloadWithBom = Buffer.concat([bomBuffer, xmlBuffer]);

    // 5. Commit changes cleanly to file paths
    const parsedFileDetails = path.parse(inputPath);
    const trackingOutputDestination = path.join(
      parsedFileDetails.dir,
      `${parsedFileDetails.name}_modded${parsedFileDetails.ext}`,
    );

    fs.writeFileSync(trackingOutputDestination, filePayloadWithBom);
    console.log(`\n✨ Mod complete! Made ${structuralChangesCounter} updates/injections.`);
    console.log(`📂 Output cleanly saved out to: ${trackingOutputDestination}`);
  } catch (pipelineFailureException) {
    console.error(
      '❌ A severe processing crash occurred during runtime execution pass:',
      pipelineFailureException,
    );
  }
}

runPreciseModPipeline();
