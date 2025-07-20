import MidiParser from 'midi-parser-js';
import { MidiData, MidiNote } from '../types/midi';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const parseMidiFile = (file: File): Promise<MidiData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        const midiData = MidiParser.parse(uint8Array);
        
        const notes: MidiNote[] = [];
        let currentTime = 0;
        const noteOnEvents: { [key: number]: { time: number; velocity: number; track: number } } = {};
        
        // Parse meta events for time signature, key signature, and tempo
        let timeSignature = { numerator: 4, denominator: 4 };
        let keySignature = 0;
        let tempo = 120; // BPM
        
        midiData.track.forEach((track, trackIndex) => {
          currentTime = 0;
          
          track.event.forEach((event) => {
            currentTime += event.deltaTime;
            
            // Parse meta events
            if (event.type === 255) { // Meta event
              if (event.data && event.data.length > 0) {
                const metaType = event.data[0];
                
                switch (metaType) {
                  case 0x58: // Time Signature
                    if (event.data.length >= 5) {
                      timeSignature = {
                        numerator: event.data[1],
                        denominator: Math.pow(2, event.data[2])
                      };
                    }
                    break;
                    
                  case 0x59: // Key Signature
                    if (event.data.length >= 3) {
                      // event.data[1] is the number of sharps/flats
                      // Positive = sharps, negative = flats
                      keySignature = event.data[1];
                      if (keySignature > 127) {
                        keySignature = keySignature - 256; // Convert to signed byte
                      }
                    }
                    break;
                    
                  case 0x51: // Set Tempo
                    if (event.data.length >= 4) {
                      const microsecondsPerQuarter = (event.data[1] << 16) | (event.data[2] << 8) | event.data[3];
                      tempo = Math.round(60000000 / microsecondsPerQuarter);
                    }
                    break;
                }
              }
            }
            
            if (event.type === 9 && event.data && event.data.length >= 2) { // Note On
              const noteNumber = event.data[0];
              const velocity = event.data[1];
              
              if (velocity > 0) {
                noteOnEvents[noteNumber] = {
                  time: currentTime,
                  velocity,
                  track: trackIndex
                };
              } else {
                // Velocity 0 is treated as note off
                if (noteOnEvents[noteNumber]) {
                  const noteOn = noteOnEvents[noteNumber];
                  const duration = currentTime - noteOn.time;
                  
                  notes.push({
                    noteNumber,
                    noteName: getNoteName(noteNumber),
                    velocity: noteOn.velocity,
                    startTime: noteOn.time,
                    duration,
                    track: noteOn.track
                  });
                  
                  delete noteOnEvents[noteNumber];
                }
              }
            } else if (event.type === 8 && event.data && event.data.length >= 2) { // Note Off
              const noteNumber = event.data[0];
              
              if (noteOnEvents[noteNumber]) {
                const noteOn = noteOnEvents[noteNumber];
                const duration = currentTime - noteOn.time;
                
                notes.push({
                  noteNumber,
                  noteName: getNoteName(noteNumber),
                  velocity: noteOn.velocity,
                  startTime: noteOn.time,
                  duration,
                  track: noteOn.track
                });
                
                delete noteOnEvents[noteNumber];
              }
            }
          });
        });
        
        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);
        
        resolve({
          notes,
          ticksPerQuarter: midiData.timeDivision,
          timeSignature,
          keySignature,
          tempo
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

const getNoteName = (noteNumber: number): string => {
  const octave = Math.floor(noteNumber / 12) - 1;
  const noteIndex = noteNumber % 12;
  return NOTE_NAMES[noteIndex] + octave;
};