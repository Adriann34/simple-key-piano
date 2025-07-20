import MidiParser from 'midi-parser-js';
import { MidiData, MidiNote } from '../types/midi';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface NoteOnEvent {
  time: number;
  velocity: number;
  track: number;
}

export const parseMidiFile = (file: File): Promise<MidiData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        const midiData = MidiParser.parse(uint8Array);
        
        console.log('Raw MIDI data:', midiData);
        console.log('Number of tracks:', midiData.track.length);
        
        const notes: MidiNote[] = [];
        const noteOnEvents: { [key: string]: NoteOnEvent } = {};
        
        // Initialize with defaults
        let timeSignature = { numerator: 4, denominator: 4 };
        let keySignature = 0;
        let tempo = 120;
        
        // Debug: Log all events in first track
        if (midiData.track.length > 0) {
          console.log('First track events:', midiData.track[0].event.slice(0, 20));
        }
        
        // Extract meta events from all tracks
        midiData.track.forEach((track, trackIndex) => {
          let currentTime = 0;
          
          track.event.forEach((event, eventIndex) => {
            currentTime += event.deltaTime;
            
            // Debug log for meta events
            if (event.type === 255) {
              console.log(`Track ${trackIndex}, Event ${eventIndex}:`, {
                type: event.type,
                data: event.data,
                deltaTime: event.deltaTime,
                currentTime
              });
            }
            
            // Parse meta events (type 255 = FF in hex)
            if (event.type === 255 && event.data && event.data.length > 0) {
              const metaType = event.data[0];
              console.log(`Meta event type: 0x${metaType.toString(16).padStart(2, '0')}`);
              
              switch (metaType) {
                case 0x58: // Time Signature (88 in decimal)
                  console.log('Time signature event data:', event.data);
                  if (event.data.length >= 5) {
                    const newTimeSignature = {
                      numerator: event.data[1],
                      denominator: Math.pow(2, event.data[2])
                    };
                    console.log('Parsed time signature:', newTimeSignature);
                    timeSignature = newTimeSignature;
                  }
                  break;
                  
                case 0x59: // Key Signature (89 in decimal)
                  console.log('Key signature event data:', event.data);
                  if (event.data.length >= 3) {
                    let newKeySignature = event.data[1];
                    // Convert from unsigned to signed byte
                    if (newKeySignature > 127) {
                      newKeySignature = newKeySignature - 256;
                    }
                    console.log('Parsed key signature:', newKeySignature);
                    keySignature = newKeySignature;
                  }
                  break;
                  
                case 0x51: // Set Tempo (81 in decimal)
                  console.log('Tempo event data:', event.data);
                  if (event.data.length >= 4) {
                    const microsecondsPerQuarter = (event.data[1] << 16) | (event.data[2] << 8) | event.data[3];
                    const newTempo = Math.round(60000000 / microsecondsPerQuarter);
                    console.log('Parsed tempo:', newTempo);
                    tempo = newTempo;
                  }
                  break;
                  
                case 0x2F: // End of Track
                  console.log('End of track');
                  break;
                  
                case 0x03: // Track Name
                  if (event.data.length > 1) {
                    const trackName = String.fromCharCode(...event.data.slice(1));
                    console.log('Track name:', trackName);
                  }
                  break;
                  
                default:
                  console.log(`Unknown meta event type: 0x${metaType.toString(16)}`);
                  break;
              }
            }
          });
        });

        console.log('Final meta data before note parsing:', { timeSignature, keySignature, tempo });

        // Second pass: extract note events
        midiData.track.forEach((track, trackIndex) => {
          let currentTime = 0;
          
          track.event.forEach((event) => {
            currentTime += event.deltaTime;
            
            if (event.type === 144 && event.data && event.data.length >= 2) { // Note On (0x90 = 144)
              const noteNumber = event.data[0];
              const velocity = event.data[1];
              
              if (velocity > 0) {
                const key = `${noteNumber}-${trackIndex}`;
                noteOnEvents[key] = {
                  time: currentTime,
                  velocity,
                  track: trackIndex
                };
              } else {
                // Velocity 0 is treated as note off
                const key = `${noteNumber}-${trackIndex}`;
                const noteOnEvent = noteOnEvents[key];
                if (noteOnEvent) {
                  const duration = currentTime - noteOnEvent.time;
                  
                  notes.push({
                    noteNumber,
                    noteName: getNoteName(noteNumber),
                    velocity: noteOnEvent.velocity,
                    startTime: noteOnEvent.time,
                    duration,
                    track: noteOnEvent.track
                  });
                  
                  delete noteOnEvents[key];
                }
              }
            } else if (event.type === 128 && event.data && event.data.length >= 2) { // Note Off (0x80 = 128)
              const noteNumber = event.data[0];
              const key = `${noteNumber}-${trackIndex}`;
              const noteOnEvent = noteOnEvents[key];
              
              if (noteOnEvent) {
                const duration = currentTime - noteOnEvent.time;
                
                notes.push({
                  noteNumber,
                  noteName: getNoteName(noteNumber),
                  velocity: noteOnEvent.velocity,
                  startTime: noteOnEvent.time,
                  duration,
                  track: noteOnEvent.track
                });
                
                delete noteOnEvents[key];
              }
            }
          });
        });
        
        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);
        
        console.log('Final parsed result:', { 
          timeSignature, 
          keySignature, 
          tempo, 
          noteCount: notes.length,
          firstFewNotes: notes.slice(0, 5)
        });
        
        resolve({
          notes,
          ticksPerQuarter: midiData.timeDivision,
          timeSignature,
          keySignature,
          tempo
        });
      } catch (error) {
        console.error('MIDI parsing error:', error);
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