import React, { useEffect, useRef, useState } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Beam, StaveConnector, BarNote, KeySignature } from 'vexflow';
import { MidiData } from '../types/midi';
import { midiNoteToVexFlowNote, getKeySignatureName, getTimeSignatureString } from '../utils/noteMapping';

interface NoteClickData {
  midiNotes: number[];
  clef: 'treble' | 'bass';
}

interface SheetMusicProps {
  midiData: MidiData | null;
  onNoteClick: (data: NoteClickData) => void;
}

interface ProcessedNote {
  midiNote: number;
  vexNote: string;
  startTime: number;
  duration: number;
  velocity: number;
}

const SheetMusic: React.FC<SheetMusicProps> = ({ midiData, onNoteClick }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [clickableElements, setClickableElements] = useState<HTMLElement[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Configuration for sheet music layout
  const MEASURES_PER_LINE = 4;
  const LINES_PER_PAGE = 6;
  const MEASURES_PER_PAGE = MEASURES_PER_LINE * LINES_PER_PAGE;
  const MEASURE_WIDTH = 320;
  const SYSTEM_HEIGHT = 200;
  const PAGE_MARGIN = 60;
  const CANVAS_WIDTH = MEASURES_PER_LINE * MEASURE_WIDTH + (PAGE_MARGIN * 2);
  const CANVAS_HEIGHT = LINES_PER_PAGE * SYSTEM_HEIGHT + (PAGE_MARGIN * 2);

  // Get VexFlow key signature string
  const getVexFlowKeySignature = (keySignature: number): string => {
    if (keySignature === 0) return '';
    
    const sharpKeys = ['', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
    const flatKeys = ['', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
    
    if (keySignature > 0 && keySignature <= 7) {
      return sharpKeys[keySignature];
    } else if (keySignature < 0 && keySignature >= -7) {
      return flatKeys[Math.abs(keySignature)];
    }
    
    return '';
  };

  // Enhanced duration calculation with time signature awareness
  const getVexFlowDuration = (durationTicks: number, ticksPerQuarter: number, timeSignature: { numerator: number; denominator: number }): string => {
    const quarterNoteDuration = ticksPerQuarter;
    const ratio = durationTicks / quarterNoteDuration;
    
    // Adjust for different time signatures
    const beatValue = 4 / timeSignature.denominator; // How many quarters per beat
    const adjustedRatio = ratio / beatValue;
    
    // Better quantization for cleaner look
    if (ratio >= 3.75) return '1';     // Whole note
    if (ratio >= 1.875) return '2';    // Half note
    if (ratio >= 0.9375) return '4';   // Quarter note
    if (ratio >= 0.46875) return '8';  // Eighth note
    if (ratio >= 0.234375) return '16'; // Sixteenth note
    return '32'; // Thirty-second note
  };

  // Better quantization for cleaner timing
  const quantizeTime = (time: number, ticksPerQuarter: number, timeSignature: { numerator: number; denominator: number }): number => {
    const beatDuration = ticksPerQuarter * (4 / timeSignature.denominator);
    const subdivisions = 32; // Quantize to 32nd notes
    const quantumSize = beatDuration / subdivisions;
    return Math.round(time / quantumSize) * quantumSize;
  };

  // Calculate measure length based on time signature
  const getMeasureLength = (ticksPerQuarter: number, timeSignature: { numerator: number; denominator: number }): number => {
    const beatDuration = ticksPerQuarter * (4 / timeSignature.denominator);
    return beatDuration * timeSignature.numerator;
  };

  // Much better note processing with intelligent filtering
  const processNotesIntoMeasures = (notes: ProcessedNote[], ticksPerQuarter: number, timeSignature: { numerator: number; denominator: number }) => {
    const measureLength = getMeasureLength(ticksPerQuarter, timeSignature);
    const measures: ProcessedNote[][] = [];
    
    // Sort notes by start time first
    const sortedNotes = notes.sort((a, b) => a.startTime - b.startTime);
    
    // Filter out notes that are too short or overlapping heavily
    const validNotes = sortedNotes.filter((note, index) => {
      const minDuration = ticksPerQuarter / 32; // 128th note minimum
      const maxDuration = measureLength * 2; // Maximum 2 whole measures
      
      // Check for valid duration and piano range
      if (note.duration < minDuration || note.duration > maxDuration) {
        return false;
      }
      
      if (note.midiNote < 21 || note.midiNote > 108) {
        return false;
      }
      
      // Remove notes that are too close to the previous note (reduces clutter)
      if (index > 0) {
        const prevNote = sortedNotes[index - 1];
        const timeDiff = note.startTime - prevNote.startTime;
        const minTimeDiff = ticksPerQuarter / 16; // Minimum 64th note separation
        
        if (timeDiff < minTimeDiff && Math.abs(note.midiNote - prevNote.midiNote) < 2) {
          return false; // Skip very close notes
        }
      }
      
      return true;
    });
    
    const notesByMeasure = new Map<number, ProcessedNote[]>();
    
    validNotes.forEach(note => {
      const measureIndex = Math.floor(note.startTime / measureLength);
      if (!notesByMeasure.has(measureIndex)) {
        notesByMeasure.set(measureIndex, []);
      }
      notesByMeasure.get(measureIndex)!.push(note);
    });

    // Process each measure with better organization
    Array.from(notesByMeasure.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([measureIndex, measureNotes]) => {
        // Sort notes within measure by start time
        measureNotes.sort((a, b) => a.startTime - b.startTime);
        
        // Limit notes per measure and prioritize important ones
        const maxNotesPerMeasure = Math.min(16, timeSignature.numerator * 4); // Scale with time signature
        let processedNotes = measureNotes;
        
        if (measureNotes.length > maxNotesPerMeasure) {
          // Prioritize notes by velocity and duration
          processedNotes = measureNotes
            .sort((a, b) => (b.velocity * b.duration) - (a.velocity * a.duration))
            .slice(0, maxNotesPerMeasure)
            .sort((a, b) => a.startTime - b.startTime);
        }
        
        measures.push(processedNotes);
      });

    return measures;
  };

  // Better chord detection and grouping
  const groupNotesIntoChords = (notes: ProcessedNote[], ticksPerQuarter: number) => {
    const chordTolerance = ticksPerQuarter / 32; // 128th note tolerance
    const chordGroups = new Map<number, ProcessedNote[]>();
    
    notes.forEach(note => {
      // Find if this note belongs to an existing chord group
      let foundGroup = false;
      for (const [timeKey, group] of chordGroups.entries()) {
        if (Math.abs(note.startTime - timeKey) <= chordTolerance) {
          group.push(note);
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        chordGroups.set(note.startTime, [note]);
      }
    });
    
    return chordGroups;
  };

  // Better beam grouping with musical logic
  const createBeamedGroups = (notes: StaveNote[]): (StaveNote | Beam)[] => {
    const result: (StaveNote | Beam)[] = [];
    let beamGroup: StaveNote[] = [];
    
    notes.forEach((note, index) => {
      const duration = note.getDuration();
      const isBeamable = ['8', '16', '32'].includes(duration as string);
      
      if (isBeamable && beamGroup.length < 4) { // Limit beam groups to 4 notes
        beamGroup.push(note);
      } else {
        // Finish current beam group
        if (beamGroup.length > 1) {
          try {
            result.push(new Beam(beamGroup));
          } catch (error) {
            console.warn('Error creating beam group:', error);
            beamGroup.forEach(n => result.push(n));
          }
        } else if (beamGroup.length === 1) {
          result.push(beamGroup[0]);
        }
        
        beamGroup = [];
        
        if (isBeamable) {
          beamGroup.push(note);
        } else {
          result.push(note);
        }
      }
    });
    
    // Handle remaining beam group
    if (beamGroup.length > 1) {
      try {
        result.push(new Beam(beamGroup));
      } catch (error) {
        console.warn('Error creating final beam group:', error);
        beamGroup.forEach(n => result.push(n));
      }
    } else if (beamGroup.length === 1) {
      result.push(beamGroup[0]);
    }
    
    return result;
  };

  const addClickHandlersToNotes = (
    noteData: Array<{staveNote: StaveNote, midiNotes: number[]}>, 
    clef: 'treble' | 'bass',
    newClickableElements: HTMLElement[]
  ) => {
    noteData.forEach(({staveNote, midiNotes}) => {
      const noteElement = staveNote.getSVGElement();
      if (noteElement) {
        noteElement.style.cursor = 'pointer';
        noteElement.style.transition = 'fill 0.2s ease';
        
        const clickHandler = (e: Event) => {
          e.stopPropagation();
          onNoteClick({
            midiNotes: midiNotes,
            clef: clef
          });
        };
        
        const mouseEnterHandler = () => {
          noteElement.style.fill = clef === 'treble' ? '#3b82f6' : '#ef4444';
        };
        
        const mouseLeaveHandler = () => {
          noteElement.style.fill = '#000000';
        };
        
        noteElement.addEventListener('click', clickHandler);
        noteElement.addEventListener('mouseenter', mouseEnterHandler);
        noteElement.addEventListener('mouseleave', mouseLeaveHandler);
        
        newClickableElements.push(noteElement as unknown as HTMLElement);
      }
    });
  };

  const cleanupClickHandlers = () => {
    clickableElements.forEach(element => {
      const newElement = element.cloneNode(true) as HTMLElement;
      element.parentNode?.replaceChild(newElement, element);
    });
    setClickableElements([]);
  };

  // Enhanced voice creation with time signature awareness
  const createVoiceWithNotes = (notes: StaveNote[], clef: 'treble' | 'bass', timeSignature: { numerator: number; denominator: number }) => {
    if (notes.length === 0) return null;

    try {
      const voice = new Voice({
        num_beats: timeSignature.numerator,
        beat_value: timeSignature.denominator
      });
      
      voice.setStrict(false);
      voice.addTickables(notes);
      return voice;
    } catch (error) {
      console.warn(`Error creating voice for ${clef} clef:`, error);
      return null;
    }
  };

  const renderPage = (measures: ProcessedNote[][], pageNumber: number) => {
    const startMeasure = pageNumber * MEASURES_PER_PAGE;
    const endMeasure = Math.min(startMeasure + MEASURES_PER_PAGE, measures.length);
    const pageMeasures = measures.slice(startMeasure, endMeasure);
    
    if (pageMeasures.length === 0) return;

    const renderer = new Renderer(divRef.current!, Renderer.Backends.SVG);
    renderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT);
    const context = renderer.getContext();
    
    const newClickableElements: HTMLElement[] = [];
    
    try {
      const linesOnPage = Math.ceil(pageMeasures.length / MEASURES_PER_LINE);
      
      for (let line = 0; line < linesOnPage; line++) {
        const yOffset = line * SYSTEM_HEIGHT + PAGE_MARGIN;
        const lineStartMeasure = line * MEASURES_PER_LINE;
        const lineEndMeasure = Math.min(lineStartMeasure + MEASURES_PER_LINE, pageMeasures.length);
        
        const trebleStaves: Stave[] = [];
        const bassStaves: Stave[] = [];
        
        // Create staves for this line
        for (let i = lineStartMeasure; i < lineEndMeasure; i++) {
          const xOffset = (i - lineStartMeasure) * MEASURE_WIDTH + PAGE_MARGIN;
          const measureIndex = i - lineStartMeasure;
          
          const trebleStave = new Stave(xOffset, yOffset, MEASURE_WIDTH);
          if (measureIndex === 0) {
            trebleStave.addClef('treble');
            
            // Add key signature if not C major
            const keySignatureString = getVexFlowKeySignature(midiData!.keySignature);
            if (keySignatureString) {
              trebleStave.addKeySignature(keySignatureString);
            }
            
            // Add time signature
            trebleStave.addTimeSignature(`${midiData!.timeSignature.numerator}/${midiData!.timeSignature.denominator}`);
          }
          trebleStave.setContext(context).draw();
          trebleStaves.push(trebleStave);
          
          const bassStave = new Stave(xOffset, yOffset + 100, MEASURE_WIDTH);
          if (measureIndex === 0) {
            bassStave.addClef('bass');
            
            // Add key signature if not C major
            const keySignatureString = getVexFlowKeySignature(midiData!.keySignature);
            if (keySignatureString) {
              bassStave.addKeySignature(keySignatureString);
            }
            
            // Add time signature
            bassStave.addTimeSignature(`${midiData!.timeSignature.numerator}/${midiData!.timeSignature.denominator}`);
          }
          bassStave.setContext(context).draw();
          bassStaves.push(bassStave);
          
          // Add connectors
          if (measureIndex === 0) {
            try {
              const connector = new StaveConnector(trebleStave, bassStave);
              connector.setType(StaveConnector.type.BRACE);
              connector.setContext(context).draw();
            } catch (error) {
              console.warn('Error creating brace connector:', error);
            }
          }
          
          try {
            const lineConnector = new StaveConnector(trebleStave, bassStave);
            lineConnector.setType(StaveConnector.type.SINGLE_LEFT);
            lineConnector.setContext(context).draw();
          } catch (error) {
            console.warn('Error creating line connector:', error);
          }
        }
        
        // Add notes to staves
        for (let measureIdx = lineStartMeasure; measureIdx < lineEndMeasure; measureIdx++) {
          const measure = pageMeasures[measureIdx];
          if (!measure || measure.length === 0) continue;
          
          const staveIndex = measureIdx - lineStartMeasure;
          const trebleStave = trebleStaves[staveIndex];
          const bassStave = bassStaves[staveIndex];
          
          // Group notes into chords with better logic
          const chordGroups = groupNotesIntoChords(measure, midiData!.ticksPerQuarter);
          
          const trebleNotes: StaveNote[] = [];
          const bassNotes: StaveNote[] = [];
          const trebleNoteData: Array<{staveNote: StaveNote, midiNotes: number[]}> = [];
          const bassNoteData: Array<{staveNote: StaveNote, midiNotes: number[]}> = [];
          
          // Process chord groups
          Array.from(chordGroups.entries())
            .sort(([a], [b]) => a - b)
            .forEach(([time, chordNotes]) => {
              const trebleChordNotes = chordNotes.filter(n => n.midiNote >= 60);
              const bassChordNotes = chordNotes.filter(n => n.midiNote < 60);
              
              // Create treble chord
              if (trebleChordNotes.length > 0) {
                try {
                  const duration = getVexFlowDuration(trebleChordNotes[0].duration, midiData!.ticksPerQuarter, midiData!.timeSignature);
                  
                  // Limit chord size for readability
                  const maxChordNotes = 4;
                  const selectedNotes = trebleChordNotes
                    .sort((a, b) => b.velocity - a.velocity) // Sort by velocity
                    .slice(0, maxChordNotes)
                    .sort((a, b) => a.midiNote - b.midiNote); // Sort by pitch
                  
                  const keys = selectedNotes.map(n => n.vexNote);
                  
                  const staveNote = new StaveNote({
                    clef: 'treble',
                    keys: keys,
                    duration: duration
                  });
                  
                  // Add accidentals
                  keys.forEach((key, index) => {
                    try {
                      if (key.includes('b')) {
                        staveNote.addModifier(new Accidental('b'), index);
                      } else if (key.includes('#')) {
                        staveNote.addModifier(new Accidental('#'), index);
                      }
                    } catch (error) {
                      console.warn('Error adding accidental:', error);
                    }
                  });
                  
                  trebleNotes.push(staveNote);
                  trebleNoteData.push({
                    staveNote: staveNote,
                    midiNotes: selectedNotes.map(n => n.midiNote)
                  });
                } catch (error) {
                  console.warn('Error creating treble note:', error);
                }
              }
              
              // Create bass chord
              if (bassChordNotes.length > 0) {
                try {
                  const duration = getVexFlowDuration(bassChordNotes[0].duration, midiData!.ticksPerQuarter, midiData!.timeSignature);
                  
                  // Limit chord size for readability
                  const maxChordNotes = 4;
                  const selectedNotes = bassChordNotes
                    .sort((a, b) => b.velocity - a.velocity) // Sort by velocity
                    .slice(0, maxChordNotes)
                    .sort((a, b) => a.midiNote - b.midiNote); // Sort by pitch
                  
                  const keys = selectedNotes.map(n => n.vexNote);
                 
                 const staveNote = new StaveNote({
                   clef: 'bass',
                   keys: keys,
                   duration: duration
                 });
                 
                 // Add accidentals
                 keys.forEach((key, index) => {
                   try {
                     if (key.includes('b')) {
                       staveNote.addModifier(new Accidental('b'), index);
                     } else if (key.includes('#')) {
                       staveNote.addModifier(new Accidental('#'), index);
                     }
                   } catch (error) {
                     console.warn('Error adding accidental:', error);
                   }
                 });
                 
                 bassNotes.push(staveNote);
                 bassNoteData.push({
                   staveNote: staveNote,
                   midiNotes: selectedNotes.map(n => n.midiNote)
                 });
               } catch (error) {
                 console.warn('Error creating bass note:', error);
               }
             }
           });
         
         // Render treble notes
         const trebleVoice = createVoiceWithNotes(trebleNotes, 'treble', midiData!.timeSignature);
         if (trebleVoice) {
           try {
             const formatter = new Formatter();
             formatter.joinVoices([trebleVoice]).format([trebleVoice], MEASURE_WIDTH - 80);
             
             trebleVoice.draw(context, trebleStave);
             addClickHandlersToNotes(trebleNoteData, 'treble', newClickableElements);
             
             // Add beams
             const beamedElements = createBeamedGroups(trebleNotes);
             beamedElements.forEach(element => {
               try {
                 if (element instanceof Beam) {
                   element.setContext(context).draw();
                 }
               } catch (error) {
                 console.warn('Error drawing beam:', error);
               }
             });
           } catch (error) {
             console.warn('Error rendering treble voice:', error);
           }
         }
         
         // Render bass notes
         const bassVoice = createVoiceWithNotes(bassNotes, 'bass', midiData!.timeSignature);
         if (bassVoice) {
           try {
             const formatter = new Formatter();
             formatter.joinVoices([bassVoice]).format([bassVoice], MEASURE_WIDTH - 80);
             
             bassVoice.draw(context, bassStave);
             addClickHandlersToNotes(bassNoteData, 'bass', newClickableElements);
             
             // Add beams
             const beamedElements = createBeamedGroups(bassNotes);
             beamedElements.forEach(element => {
               try {
                 if (element instanceof Beam) {
                   element.setContext(context).draw();
                 }
               } catch (error) {
                 console.warn('Error drawing beam:', error);
               }
             });
           } catch (error) {
             console.warn('Error rendering bass voice:', error);
           }
         }
       }
     }
     
     setClickableElements(newClickableElements);
     
   } catch (error) {
     console.error('Error rendering sheet music:', error);
     if (divRef.current) {
       divRef.current.innerHTML = '<p class="text-red-500">Error rendering sheet music. The MIDI file may be too complex.</p>';
     }
   }
 };

 useEffect(() => {
   if (!midiData || !divRef.current) return;

   cleanupClickHandlers();
   divRef.current.innerHTML = '';
   
   try {
     const processedNotes: ProcessedNote[] = midiData.notes
       .filter(note => note.noteNumber >= 21 && note.noteNumber <= 108) // Valid piano range
       .map(note => ({
         midiNote: note.noteNumber,
         vexNote: midiNoteToVexFlowNote(note.noteNumber, midiData.keySignature),
         startTime: quantizeTime(note.startTime, midiData.ticksPerQuarter, midiData.timeSignature),
         duration: Math.max(note.duration, midiData.ticksPerQuarter / 32), // Minimum duration
         velocity: note.velocity
       }));

     const measures = processNotesIntoMeasures(processedNotes, midiData.ticksPerQuarter, midiData.timeSignature);
     const totalPagesNeeded = Math.ceil(measures.length / MEASURES_PER_PAGE);
     setTotalPages(totalPagesNeeded);
     
     // Reset to first page if current page is out of range
     if (currentPage >= totalPagesNeeded) {
       setCurrentPage(0);
     }
     
     // Render current page
     renderPage(measures, currentPage);
   } catch (error) {
     console.error('Error processing MIDI data:', error);
     if (divRef.current) {
       divRef.current.innerHTML = '<p class="text-red-500">Error processing MIDI data. Please try a different file.</p>';
     }
   }

   return () => {
     cleanupClickHandlers();
   };
 }, [midiData, currentPage, onNoteClick]);

 const nextPage = () => {
   if (currentPage < totalPages - 1) {
     setCurrentPage(currentPage + 1);
   }
 };

 const previousPage = () => {
   if (currentPage > 0) {
     setCurrentPage(currentPage - 1);
   }
 };

 const goToPage = (pageNumber: number) => {
   if (pageNumber >= 0 && pageNumber < totalPages) {
     setCurrentPage(pageNumber);
   }
 };

 return (
   <div className="bg-white p-6 rounded-lg shadow-lg">
     <div className="flex justify-between items-center mb-4">
       <div>
         <h3 className="text-xl font-semibold">Sheet Music</h3>
         {midiData && (
           <div className="text-sm text-gray-600 mt-1">
             <span className="mr-4">Key: {getKeySignatureName(midiData.keySignature)}</span>
             <span className="mr-4">Time: {getTimeSignatureString(midiData.timeSignature.numerator, midiData.timeSignature.denominator)}</span>
             <span>Tempo: {midiData.tempo} BPM</span>
           </div>
         )}
       </div>
       {totalPages > 1 && (
         <div className="flex items-center gap-4">
           <button
             onClick={previousPage}
             disabled={currentPage === 0}
             className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
           >
             Previous
           </button>
           <span className="text-sm text-gray-600">
             Page {currentPage + 1} of {totalPages}
           </span>
           <button
             onClick={nextPage}
             disabled={currentPage === totalPages - 1}
             className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
           >
             Next
           </button>
         </div>
       )}
     </div>
     
     <div className="overflow-auto border rounded-lg bg-white">
       <div 
         ref={divRef} 
         className="w-full h-auto p-4"
         style={{ 
           minWidth: `${CANVAS_WIDTH}px`,
           minHeight: `${CANVAS_HEIGHT}px`,
           backgroundColor: 'white'
         }}
       />
     </div>
     
     {totalPages > 1 && (
       <div className="mt-4 flex justify-center gap-2 flex-wrap">
         {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
           const pageIndex = totalPages > 10 && i >= 5 ? totalPages - 10 + i : i;
           return (
             <button
               key={pageIndex}
               onClick={() => goToPage(pageIndex)}
               className={`px-3 py-1 rounded text-sm ${
                 currentPage === pageIndex 
                   ? 'bg-blue-500 text-white' 
                   : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
               }`}
             >
               {pageIndex + 1}
             </button>
           );
         })}
         {totalPages > 10 && (
           <span className="px-3 py-1 text-sm text-gray-500">
             ... and {totalPages - 10} more
           </span>
         )}
       </div>
     )}
     
     <div className="mt-4 text-sm text-gray-600">
       <p>Click on any note to highlight the corresponding keys on the piano</p>
       <p className="mt-1">Blue highlights = Treble clef (right hand) • Red highlights = Bass clef (left hand)</p>
       <p className="mt-1">Professional sheet music with proper key and time signatures</p>
       <p className="mt-1 text-xs text-gray-500">
         {clickableElements.length} clickable notes • Page {currentPage + 1} of {totalPages}
       </p>
     </div>
   </div>
 );
};

export default SheetMusic;