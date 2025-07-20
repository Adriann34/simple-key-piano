export const midiNoteToVexFlowNote = (midiNote: number, keySignature: number = 0): string => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  let noteName = noteNames[noteIndex];
  
  // Apply key signature logic for better note representation
  if (keySignature !== 0) {
    noteName = applyKeySignature(noteName, keySignature);
  } else {
    // Convert sharps to flats for better display in C major
    const sharpToFlat: { [key: string]: string } = {
      'C#': 'Db',
      'D#': 'Eb',
      'F#': 'Gb',
      'G#': 'Ab',
      'A#': 'Bb'
    };
    
    if (sharpToFlat[noteName]) {
      noteName = sharpToFlat[noteName];
    }
  }
  
  return `${noteName.toLowerCase()}/${octave}`;
};

const applyKeySignature = (noteName: string, keySignature: number): string => {
  // Order of sharps: F# C# G# D# A# E# B#
  // Order of flats: Bb Eb Ab Db Gb Cb Fb
  
  if (keySignature > 0) {
    // Sharp keys - keep sharps as sharps
    const sharpNotes = ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'];
    const activeSharpNotes = sharpNotes.slice(0, keySignature);
    
    // Don't convert sharps to flats if they're in the key signature
    if (activeSharpNotes.includes(noteName)) {
      return noteName;
    }
    
    // Convert other accidentals appropriately
    const conversionMap: { [key: string]: string } = {
      'Db': 'C#',
      'Eb': 'D#',
      'Gb': 'F#',
      'Ab': 'G#',
      'Bb': 'A#'
    };
    
    return conversionMap[noteName] || noteName;
    
  } else if (keySignature < 0) {
    // Flat keys - prefer flats
    const flatNotes = ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb'];
    const activeFlatNotes = flatNotes.slice(0, Math.abs(keySignature));
    
    // Don't convert flats to sharps if they're in the key signature
    if (activeFlatNotes.some(flatNote => flatNote.startsWith(noteName.charAt(0)))) {
      // Convert sharps to their flat equivalents
      const conversionMap: { [key: string]: string } = {
        'C#': 'Db',
        'D#': 'Eb',
        'F#': 'Gb',
        'G#': 'Ab',
        'A#': 'Bb'
      };
      
      return conversionMap[noteName] || noteName;
    }
  }
  
  return noteName;
};

export const getKeySignatureName = (keySignature: number): string => {
  const keys = [
    'C Major',      // 0
    'G Major',      // 1#
    'D Major',      // 2#
    'A Major',      // 3#
    'E Major',      // 4#
    'B Major',      // 5#
    'F# Major',     // 6#
    'C# Major',     // 7#
  ];
  
  const flatKeys = [
    'F Major',      // 1b
    'Bb Major',     // 2b
    'Eb Major',     // 3b
    'Ab Major',     // 4b
    'Db Major',     // 5b
    'Gb Major',     // 6b
    'Cb Major',     // 7b
  ];
  
  if (keySignature === 0) {
    return keys[0];
  } else if (keySignature > 0 && keySignature <= 7) {
    return keys[keySignature];
  } else if (keySignature < 0 && keySignature >= -7) {
    return flatKeys[Math.abs(keySignature) - 1];
  }
  
  return `${keySignature > 0 ? keySignature + ' sharps' : Math.abs(keySignature) + ' flats'}`;
};

export const getTimeSignatureString = (numerator: number, denominator: number): string => {
  return `${numerator}/${denominator}`;
};

export const getKeyPosition = (midiNote: number): number => {
  return midiNote - 21;
};

export const isBlackKey = (midiNote: number): boolean => {
  const noteIndex = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(noteIndex);
};