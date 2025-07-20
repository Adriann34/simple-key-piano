export const midiNoteToVexFlowNote = (midiNote: number, keySignature: number = 0): string => {
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  
  // Enhanced enharmonic spelling based on key signature and musical context
  const noteName = getEnharmonicSpellingAdvanced(noteIndex, keySignature);
  
  return `${noteName.toLowerCase()}/${octave}`;
};

function getEnharmonicSpellingAdvanced(noteIndex: number, keySignature: number): string {
  // Natural notes that don't need enharmonic consideration
  const naturalNotes = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B
  
  if (naturalNotes.includes(noteIndex)) {
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][noteIndex];
  }
  
  // For accidentals, use more sophisticated logic
  const sharpKeys = [1, 2, 3, 4, 5, 6, 7]; // G, D, A, E, B, F#, C#
  const flatKeys = [-1, -2, -3, -4, -5, -6, -7]; // F, Bb, Eb, Ab, Db, Gb, Cb
  
  // Enhanced enharmonic preferences based on key signature and common practice
  if (keySignature > 0) {
    // Sharp key signatures - prefer sharps
    const sharpPreferences: { [key: number]: string } = {
      1: 'C#',  // C# instead of Db
      3: 'D#',  // D# instead of Eb  
      6: 'F#',  // F# instead of Gb
      8: 'G#',  // G# instead of Ab
      10: 'A#'  // A# instead of Bb
    };
    
    // Additional context for very sharp keys
    if (keySignature >= 5) {
      // In keys with many sharps, even more preference for sharp spelling
      return sharpPreferences[noteIndex] || ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][noteIndex];
    }
    
    return sharpPreferences[noteIndex] || ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][noteIndex];
  }
  else if (keySignature < 0) {
    // Flat key signatures - prefer flats
    const flatPreferences: { [key: number]: string } = {
      1: 'Db',  // Db instead of C#
      3: 'Eb',  // Eb instead of D#
      6: 'Gb',  // Gb instead of F#
      8: 'Ab',  // Ab instead of G#
      10: 'Bb'  // Bb instead of A#
    };
    
    // Additional context for very flat keys
    if (keySignature <= -4) {
      // In keys with many flats, even more preference for flat spelling
      return flatPreferences[noteIndex] || ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][noteIndex];
    }
    
    return flatPreferences[noteIndex] || ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][noteIndex];
  }
  else {
    // No key signature - use context-dependent spelling
    // Prefer naturals and common accidentals
    const neutralPreferences: { [key: number]: string } = {
      1: 'C#',  // C# is more common than Db in neutral contexts
      3: 'Eb',  // Eb is more common than D#
      6: 'F#',  // F# is more common than Gb
      8: 'Ab',  // Ab is more common than G#
      10: 'Bb'  // Bb is more common than A#
    };
    
    return neutralPreferences[noteIndex] || ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][noteIndex];
  }
}

export const getKeyPosition = (midiNote: number): number => {
  return midiNote - 21; // A0 is MIDI note 21, first key on piano
};

export const isBlackKey = (midiNote: number): boolean => {
  const noteIndex = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(noteIndex); // C#, D#, F#, G#, A#
};

// Enhanced VexFlow key signature format with comprehensive validation
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
  
  // Handle extreme key signatures by returning closest valid key
  if (sharps > 7) {
    console.warn(`Extreme sharp key signature (${sharps}), using C# major`);
    return 'C#';
  } else if (sharps < -7) {
    console.warn(`Extreme flat key signature (${sharps}), using Cb major`);
    return 'Cb';
  }
  
  return '';
};

// Enhanced VexFlow time signature with extensive validation
export const getVexFlowTimeSignature = (numerator: number, denominator: number): string => {
  // Comprehensive list of valid time signatures
  const validTimeSignatures = [
    // Simple time signatures
    '1/1', '1/2', '1/4', '1/8',
    '2/1', '2/2', '2/4', '2/8', '2/16',
    '3/1', '3/2', '3/4', '3/8', '3/16',
    '4/1', '4/2', '4/4', '4/8', '4/16',
    '5/4', '5/8', '5/16',
    // Compound time signatures
    '6/2', '6/4', '6/8', '6/16',
    '7/4', '7/8', '7/16',
    '8/8', '8/16',
    '9/4', '9/8', '9/16',
    '10/8', '10/16',
    '12/4', '12/8', '12/16',
    '15/8', '15/16',
    '18/8', '18/16',
    '21/8', '21/16',
    '24/8', '24/16',
    // Complex time signatures
    '11/8', '13/8', '14/8', '16/8',
    '17/8', '19/8', '20/8', '22/8', '23/8',
    // Mixed meter
    '7/4', '11/4', '13/4', '15/4'
  ];
  
  const timeSignature = `${numerator}/${denominator}`;
  
  // Return the time signature if valid
  if (validTimeSignatures.includes(timeSignature)) {
    console.log(`Valid VexFlow time signature: ${timeSignature}`);
    return timeSignature;
  } else {
    // Try to find a reasonable approximation
    console.warn(`Invalid time signature ${timeSignature}, attempting to find approximation`);
    
    // Common approximations
    if (numerator >= 5 && numerator <= 8 && denominator === 4) {
      return timeSignature; // Allow some flexibility for odd meters
    }
    
    // For very unusual time signatures, find closest valid one
    const validNumerators = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const validDenominators = [1, 2, 4, 8, 16];
    
    const closestNumerator = validNumerators.reduce((prev, curr) => 
      Math.abs(curr - numerator) < Math.abs(prev - numerator) ? curr : prev
    );
    
    const closestDenominator = validDenominators.reduce((prev, curr) => 
      Math.abs(curr - denominator) < Math.abs(prev - denominator) ? curr : prev
    );
    
    const approximation = `${closestNumerator}/${closestDenominator}`;
    
    if (validTimeSignatures.includes(approximation)) {
      console.warn(`Using approximation: ${approximation} for original ${timeSignature}`);
      return approximation;
    }
    
    // Final fallback
    console.warn(`No valid approximation found for ${timeSignature}, defaulting to 4/4`);
    return '4/4';
  }
};