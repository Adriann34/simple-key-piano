export const midiNoteToVexFlowNote = (midiNote: number): string => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  let noteName = noteNames[noteIndex];
  
  // Convert sharps to flats for better display
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
  
  return `${noteName.toLowerCase()}/${octave}`;
};

export const getKeyPosition = (midiNote: number): number => {
  // Map MIDI note to piano key position (0-87 for 88 keys)
  return midiNote - 21; // A0 is MIDI note 21, first key on piano
};

export const isBlackKey = (midiNote: number): boolean => {
  const noteIndex = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(noteIndex); // C#, D#, F#, G#, A#
};