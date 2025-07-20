export const midiNoteToVexFlowNote = (midiNote: number, keySignature: number = 0): string => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  let noteName = noteNames[noteIndex];
  
  // Apply key signature logic
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
  // Key signature mapping: positive = sharps, negative = flats
  const sharpOrder = ['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'];
  const flatOrder = ['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb'];
  
  if (keySignature > 0) {
    // Sharp keys
    const sharpsInKey = sharpOrder.slice(0, keySignature);
    
    // Convert natural notes to sharps if they're in the key signature
    const noteMap: { [key: string]: string } = {
      'F': sharpsInKey.includes('F#') ? 'F#' : 'F',
      'C': sharpsInKey.includes('C#') ? 'C#' : 'C',
      'G': sharpsInKey.includes('G#') ? 'G#' : 'G',
      'D': sharpsInKey.includes('D#') ? 'D#' : 'D',
      'A': sharpsInKey.includes('A#') ? 'A#' : 'A',
      'E': sharpsInKey.includes('E#') ? 'E#' : 'E',
      'B': sharpsInKey.includes('B#') ? 'B#' : 'B'
    };
    
    return noteMap[noteName] || noteName;
  } else if (keySignature < 0) {
    // Flat keys
    const flatsInKey = flatOrder.slice(0, Math.abs(keySignature));
    
    // Convert natural notes to flats if they're in the key signature
    const noteMap: { [key: string]: string } = {
      'B': flatsInKey.includes('Bb') ? 'Bb' : 'B',
      'E': flatsInKey.includes('Eb') ? 'Eb' : 'E',
      'A': flatsInKey.includes('Ab') ? 'Ab' : 'A',
      'D': flatsInKey.includes('Db') ? 'Db' : 'D',
      'G': flatsInKey.includes('Gb') ? 'Gb' : 'G',
      'C': flatsInKey.includes('Cb') ? 'Cb' : 'C',
      'F': flatsInKey.includes('Fb') ? 'Fb' : 'F'
    };
    
    return noteMap[noteName] || noteName;
  }
  
  return noteName;
};

export const getKeySignatureName = (keySignature: number): string => {
  const majorKeys = [
    'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#',  // Sharps: 0-7
    'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'   // Flats: -1 to -7
  ];
  
  if (keySignature >= 0 && keySignature <= 7) {
    return majorKeys[keySignature] + ' Major';
  } else if (keySignature >= -7 && keySignature < 0) {
    return majorKeys[8 + Math.abs(keySignature)] + ' Major';
  }
  
  return 'Unknown Key';
};

export const getTimeSignatureString = (numerator: number, denominator: number): string => {
  return `${numerator}/${denominator}`;
};

export const getKeyPosition = (midiNote: number): number => {
  // Map MIDI note to piano key position (0-87 for 88 keys)
  return midiNote - 21; // A0 is MIDI note 21, first key on piano
};

export const isBlackKey = (midiNote: number): boolean => {
  const noteIndex = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(noteIndex); // C#, D#, F#, G#, A#
};