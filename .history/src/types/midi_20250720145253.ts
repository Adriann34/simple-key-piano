export interface MidiNote {
  noteNumber: number;
  noteName: string;
  velocity: number;
  startTime: number;
  duration: number;
  track: number;
}

export interface MidiData {
  notes: MidiNote[];
  ticksPerQuarter: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  keySignature: number;
  keyName: string;
  keyMode: 'major' | 'minor';
  tempoChanges: Array<{ time: number; tempo: number }>;
  confidence: {
    key: number;
    timeSignature: number;
  };
}