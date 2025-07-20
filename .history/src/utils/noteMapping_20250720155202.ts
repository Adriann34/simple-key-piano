export const midiNoteToVexFlowNote = (midiNote: number, keySignature: number = 0): string => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  let noteName = noteNames[noteIndex];
  
  // Intelligent enharmonic spelling based on key signature
  noteName = getEnharmonicSpelling(noteIndex, keySignature);
  
  return `${noteName.toLowerCase()}/${octave}`;
};

function getEnharmonicSpelling(noteIndex: number, keySignature: number): string {
  // Sharp key signatures (positive values)
  if (keySignature > 0) {
    const sharpPreferences: { [key: number]: string } = {
      1: 'C#', 3: 'D#', 6: 'F#', 8: 'G#', 10: 'A#'
    };
    return sharpPreferences[noteIndex] || ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][noteIndex];
  }
  // Flat key signatures (negative values)
  else if (keySignature < 0) {
    const flatPreferences: { [key: number]: string } = {
      1: 'Db', 3: 'Eb', 6: 'Gb', 8: 'Ab', 10: 'Bb'
    };
    return flatPreferences[noteIndex] || ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][noteIndex];
  }
  // No key signature - default to naturals where possible
  else {
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][noteIndex];
  }
}

export const getKeyPosition = (midiNote: number): number => {
  return midiNote - 21; // A0 is MIDI note 21, first key on piano
};

export const isBlackKey = (midiNote: number): boolean => {
  const noteIndex = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(noteIndex); // C#, D#, F#, G#, A#
};

// Enhanced VexFlow key signature format with validation
export const getVexFlowKeySignature = (sharps: number): string => {
  if (sharps === 0) return '';
  
  // VexFlow expects key names, not numbers with sharps/flats
  const sharpKeys = ['', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const flatKeys = ['', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  
  if (sharps > 0 && sharps <= 7) {
    return sharpKeys[sharps];
  } else if (sharps < 0 && sharps >= -7) {
    return flatKeys[-sharps];
  }
  
  return '';
};

// Enhanced VexFlow time signature with validation
export const getVexFlowTimeSignature = (numerator: number, denominator: number): string => {
  // Validate common time signatures
  const validTimeSignatures = [
    '2/2', '2/4', '2/8',
    '3/2', '3/4', '3/8', '3/16',
    '4/2', '4/4', '4/8', '4/16',
    '5/4', '5/8',
    '6/4', '6/8', '6/16',
    '7/8', '7/16',
    '9/8', '9/16',
    '12/8', '12/16'
  ];
  
  const timeSignature = `${numerator}/${denominator}`;
  
  // Return the time signature if valid, otherwise default to 4/4
  if (validTimeSignatures.includes(timeSignature)) {
    console.log(`Valid VexFlow time signature: ${timeSignature}`);
    return timeSignature;
  } else {
    console.warn(`Invalid time signature ${timeSignature}, defaulting to 4/4`);
    return '4/4';
  }
};