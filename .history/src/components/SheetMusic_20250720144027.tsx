import React, { useEffect, useRef, useState } from 'react';
import { 
  Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Beam, 
  StaveConnector, KeySignature, TimeSignature, Factory 
} from 'vexflow';
import { MidiData } from '../types/midi';
import { midiNoteToVexFlowNote, getVexFlowKeySignature, getVexFlowTimeSignature } from '../utils/noteMapping';

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
  voice: 'treble' | 'bass';
}

interface VoiceData {
  trebleNotes: StaveNote[];
  bassNotes: StaveNote[];
  trebleMetadata: Array<{ staveNote: StaveNote; midiNotes: number[] }>;
  bassMetadata: Array<{ staveNote: StaveNote; midiNotes: number[] }>;
}

const SheetMusic: React.FC<SheetMusicProps> = ({ midiData, onNoteClick }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [clickableElements, setClickableElements] = useState<HTMLElement[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Enhanced layout configuration
  const MEASURES_PER_LINE = 4;
  const LINES_PER_PAGE = 4;
  const MEASURES_PER_PAGE = MEASURES_PER_LINE * LINES_PER_PAGE;
  const MEASURE_WIDTH = 350;
  const SYSTEM_HEIGHT = 220;
  const PAGE_MARGIN = 40;
  const CANVAS_WIDTH = MEASURES_PER_LINE * MEASURE_WIDTH + (PAGE_MARGIN * 2);
  const CANVAS_HEIGHT = LINES_PER_PAGE * SYSTEM_HEIGHT + (PAGE_MARGIN * 2);

  // Advanced duration mapping with musical intelligence
  const getMusicalDuration = (durationTicks: number, ticksPerQuarter: number, timeSignature: { numerator: number, denominator: number }): string => {
    const quarterNoteDuration = ticksPerQuarter;
    const ratio = durationTicks / quarterNoteDuration;
    
    // Advanced quantization based on time signature
    const beatUnit = 4 / timeSignature.denominator;
    const adjustedRatio = ratio / beatUnit;
    
    if (adjustedRatio >= 3.75) return '1';      // Whole note
    if (adjustedRatio >= 1.875) return '2';     // Half note  
    if (adjustedRatio >= 0.9375) return '4';    // Quarter note
    if (adjustedRatio >= 0.46875) return '8';   // Eighth note
    if (adjustedRatio >= 0.234375) return '16'; // Sixteenth note
    if (adjustedRatio >= 0.1171875) return '32'; // Thirty-second note
    return '64'; // Sixty-fourth note
  };

  // Intelligent voice separation algorithm
  const separateVoices = (notes: ProcessedNote[]): { trebleNotes: ProcessedNote[]; bassNotes: ProcessedNote[] } => {
    // Middle C (MIDI 60) as split point, but with intelligent context analysis
    const trebleNotes: ProcessedNote[] = [];
    const bassNotes: ProcessedNote[] = [];
    
    // Analyze the overall range and density
    const sortedNotes = [...notes].sort((a, b) => a.midiNote - b.midiNote);
    const lowestNote = sortedNotes[0]?.midiNote || 60;
    const highestNote = sortedNotes[sortedNotes.length - 1]?.midiNote || 60;
    const range = highestNote - lowestNote;
    
    // Dynamic split point based on the piece's range
    let splitPoint = 60; // Middle C default
    if (range > 48) { // More than 4 octaves
      splitPoint = lowestNote + Math.floor(range * 0.4); // Split at 40% from bottom
    }
    
    notes.forEach(note => {
      if (note.midiNote >= splitPoint) {
        trebleNotes.push({ ...note, voice: 'treble' });
      } else {
        bassNotes.push({ ...note, voice: 'bass' });
      }
    });
    
    return { trebleNotes, bassNotes };
  };

  // Advanced chord detection with musical context
  const groupIntoChords = (notes: ProcessedNote[], ticksPerQuarter: number): Map<number, ProcessedNote[]> => {
    const chordTolerance = ticksPerQuarter / 16; // Sixteenth note tolerance
    const chordGroups = new Map<number, ProcessedNote[]>();
    
    notes.forEach(note => {
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

  // Musical measure processing with proper barlines
  const processNotesIntoMeasures = (notes: ProcessedNote[], midiData: MidiData): ProcessedNote[][] => {
    const { timeSignature, ticksPerQuarter } = midiData;
    const measureLength = ticksPerQuarter * 4 * (timeSignature.numerator / timeSignature.denominator);
    
    const measures: ProcessedNote[][] = [];
    const notesByMeasure = new Map<number, ProcessedNote[]>();
    
    // Enhanced note filtering for musical relevance
    const validNotes = notes.filter(note => {
      const minDuration = ticksPerQuarter / 32; // Thirty-second note minimum
      const maxDuration = measureLength * 2; // Maximum 2 measures
      
      return (
        note.duration >= minDuration && 
        note.duration <= maxDuration &&
        note.midiNote >= 21 && note.midiNote <= 108 && // Piano range
        note.velocity >= 10 // Minimum velocity threshold
      );
    });
    
    validNotes.forEach(note => {
      const measureIndex = Math.floor(note.startTime / measureLength);
      if (!notesByMeasure.has(measureIndex)) {
        notesByMeasure.set(measureIndex, []);
      }
      notesByMeasure.get(measureIndex)!.push(note);
    });

    Array.from(notesByMeasure.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([measureIndex, measureNotes]) => {
        // Sort by start time and limit complexity
        measureNotes.sort((a, b) => a.startTime - b.startTime);
        
        // Intelligent note density management
        const maxNotesPerMeasure = timeSignature.numerator * 8; // Reasonable limit
        if (measureNotes.length > maxNotesPerMeasure) {
          // Prioritize by velocity and duration
          measureNotes.sort((a, b) => (b.velocity * b.duration) - (a.velocity * a.duration));
          measureNotes = measureNotes.slice(0, maxNotesPerMeasure);
          measureNotes.sort((a, b) => a.startTime - b.startTime);
        }
        
        measures.push(measureNotes);
      });

    return measures;
  };

  // Enhanced beam creation with musical logic
  const createIntelligentBeams = (notes: StaveNote[], timeSignature: { numerator: number, denominator: number }): (StaveNote | Beam)[] => {
    const result: (StaveNote | Beam)[] = [];
    let beamGroup: StaveNote[] = [];
    
    const beamableNotes = ['8', '16', '32', '64'];
    const maxBeamGroupSize = timeSignature.denominator >= 8 ? 6 : 4;
    
    notes.forEach((note, index) => {
      const duration = note.getDuration();
      
      if (beamableNotes.includes(duration as string) && beamGroup.length < maxBeamGroupSize) {
        beamGroup.push(note);
      } else {
        // Finish current beam group
        if (beamGroup.length > 1) {
          try {
            result.push(new Beam(beamGroup));
          } catch (error) {
            console.warn('Beam creation error:', error);
            beamGroup.forEach(n => result.push(n));
          }
        } else if (beamGroup.length === 1) {
          result.push(beamGroup[0]);
        }
        
        beamGroup = [];
        
        if (beamableNotes.includes(duration as string)) {
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
        console.warn('Final beam creation error:', error);
        beamGroup.forEach(n => result.push(n));
      }
    } else if (beamGroup.length === 1) {
      result.push(beamGroup[0]);
    }
    
    return result;
  };

  // Create voices with proper musical formatting
  const createMeasureVoices = (measure: ProcessedNote[], clef: 'treble' | 'bass', midiData: MidiData): VoiceData => {
    const { trebleNotes, bassNotes } = separateVoices(measure);
    const targetNotes = clef === 'treble' ? trebleNotes : bassNotes;
    
    if (targetNotes.length === 0) {
      return {
        trebleNotes: [],
        bassNotes: [],
        trebleMetadata: [],
        bassMetadata: []
      };
    }

    const chordGroups = groupIntoChords(targetNotes, midiData.ticksPerQuarter);
    const staveNotes: StaveNote[] = [];
    const metadata: Array<{ staveNote: StaveNote; midiNotes: number[] }> = [];

    Array.from(chordGroups.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([time, chordNotes]) => {
        try {
          // Limit chord complexity for readability
          const maxChordNotes = 6;
          const selectedNotes = chordNotes
            .sort((a, b) => b.velocity - a.velocity)
            .slice(0, maxChordNotes)
            .sort((a, b) => a.midiNote - b.midiNote);

          const keys = selectedNotes.map(n => midiNoteToVexFlowNote(n.midiNote, midiData.keySignature));
          const duration = getMusicalDuration(selectedNotes[0].duration, midiData.ticksPerQuarter, midiData.timeSignature);

          const staveNote = new StaveNote({
            clef: clef,
            keys: keys,
            duration: duration
          });

          // Add accidentals based on key signature
          keys.forEach((key, index) => {
            try {
              if (key.includes('b') && midiData.keySignature >= 0) {
                staveNote.addModifier(new Accidental('b'), index);
              } else if (key.includes('#') && midiData.keySignature <= 0) {
                staveNote.addModifier(new Accidental('#'), index);
              }
            } catch (error) {
              console.warn('Accidental error:', error);
            }
          });

          staveNotes.push(staveNote);
          metadata.push({
            staveNote: staveNote,
            midiNotes: selectedNotes.map(n => n.midiNote)
          });
        } catch (error) {
          console.warn(`Error creating ${clef} note:`, error);
        }
      });

    const result: VoiceData = {
      trebleNotes: [],
      bassNotes: [],
      trebleMetadata: [],
bassMetadata: []
   };

   if (clef === 'treble') {
     result.trebleNotes = staveNotes;
     result.trebleMetadata = metadata;
   } else {
     result.bassNotes = staveNotes;
     result.bassMetadata = metadata;
   }

   return result;
 };

 // Enhanced click handler with proper event management
 const addClickHandlersToNotes = (
   noteData: Array<{staveNote: StaveNote, midiNotes: number[]}>, 
   clef: 'treble' | 'bass',
   newClickableElements: HTMLElement[]
 ) => {
   noteData.forEach(({staveNote, midiNotes}) => {
     const noteElement = staveNote.getSVGElement();
     if (noteElement) {
       noteElement.style.cursor = 'pointer';
       noteElement.style.transition = 'all 0.2s ease';
       
       const clickHandler = (e: Event) => {
         e.stopPropagation();
         onNoteClick({
           midiNotes: midiNotes,
           clef: clef
         });
       };
       
       const mouseEnterHandler = () => {
         noteElement.style.fill = clef === 'treble' ? '#3b82f6' : '#ef4444';
         noteElement.style.transform = 'scale(1.05)';
       };
       
       const mouseLeaveHandler = () => {
         noteElement.style.fill = '#000000';
         noteElement.style.transform = 'scale(1)';
       };
       
       noteElement.addEventListener('click', clickHandler);
       noteElement.addEventListener('mouseenter', mouseEnterHandler);
       noteElement.addEventListener('mouseleave', mouseLeaveHandler);
       
       newClickableElements.push(noteElement as unknown as HTMLElement);
     }
   });
 };

 // Professional page rendering with proper musical layout
 const renderPage = (measures: ProcessedNote[][], pageNumber: number) => {
   const startMeasure = pageNumber * MEASURES_PER_PAGE;
   const endMeasure = Math.min(startMeasure + MEASURES_PER_PAGE, measures.length);
   const pageMeasures = measures.slice(startMeasure, endMeasure);
   
   if (pageMeasures.length === 0) return;

   const renderer = new Renderer(divRef.current!, Renderer.Backends.SVG);
   renderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT);
   const context = renderer.getContext();
   context.setFont('Arial', 10);
   
   const newClickableElements: HTMLElement[] = [];
   
   try {
     const linesOnPage = Math.ceil(pageMeasures.length / MEASURES_PER_LINE);
     
     for (let line = 0; line < linesOnPage; line++) {
       const yOffset = line * SYSTEM_HEIGHT + PAGE_MARGIN;
       const lineStartMeasure = line * MEASURES_PER_LINE;
       const lineEndMeasure = Math.min(lineStartMeasure + MEASURES_PER_LINE, pageMeasures.length);
       
       const trebleStaves: Stave[] = [];
       const bassStaves: Stave[] = [];
       
       // Create staves with proper musical elements
       for (let i = lineStartMeasure; i < lineEndMeasure; i++) {
         const xOffset = (i - lineStartMeasure) * MEASURE_WIDTH + PAGE_MARGIN;
         const measureIndex = i - lineStartMeasure;
         const absoluteMeasureIndex = startMeasure + i;
         
         // Treble stave
         const trebleStave = new Stave(xOffset, yOffset, MEASURE_WIDTH);
         if (measureIndex === 0) {
           trebleStave.addClef('treble');
           
           // Add key signature
           if (midiData && midiData.keySignature !== 0) {
             const keySpec = getVexFlowKeySignature(midiData.keySignature);
             if (keySpec) {
               trebleStave.addKeySignature(keySpec);
             }
           }
           
           // Add time signature
           if (midiData) {
             const timeSpec = getVexFlowTimeSignature(midiData.timeSignature.numerator, midiData.timeSignature.denominator);
             trebleStave.addTimeSignature(timeSpec);
           }
         }
         trebleStave.setContext(context).draw();
         trebleStaves.push(trebleStave);
         
         // Bass stave
         const bassStave = new Stave(xOffset, yOffset + 100, MEASURE_WIDTH);
         if (measureIndex === 0) {
           bassStave.addClef('bass');
           
           // Add key signature
           if (midiData && midiData.keySignature !== 0) {
             const keySpec = getVexFlowKeySignature(midiData.keySignature);
             if (keySpec) {
               bassStave.addKeySignature(keySpec);
             }
           }
           
           // Add time signature
           if (midiData) {
             const timeSpec = getVexFlowTimeSignature(midiData.timeSignature.numerator, midiData.timeSignature.denominator);
             bassStave.addTimeSignature(timeSpec);
           }
         }
         bassStave.setContext(context).draw();
         bassStaves.push(bassStave);
         
         // Add system connectors
         if (measureIndex === 0) {
           try {
             const brace = new StaveConnector(trebleStave, bassStave);
             brace.setType(StaveConnector.type.BRACE);
             brace.setContext(context).draw();
           } catch (error) {
             console.warn('Brace connector error:', error);
           }
         }
         
         try {
           const line = new StaveConnector(trebleStave, bassStave);
           line.setType(StaveConnector.type.SINGLE_LEFT);
           line.setContext(context).draw();
         } catch (error) {
           console.warn('Line connector error:', error);
         }
       }
       
       // Render notes for each measure in this line
       for (let measureIdx = lineStartMeasure; measureIdx < lineEndMeasure; measureIdx++) {
         const measure = pageMeasures[measureIdx];
         if (!measure || measure.length === 0) continue;
         
         const staveIndex = measureIdx - lineStartMeasure;
         const trebleStave = trebleStaves[staveIndex];
         const bassStave = bassStaves[staveIndex];
         
         // Process treble clef
         const trebleVoiceData = createMeasureVoices(measure, 'treble', midiData!);
         if (trebleVoiceData.trebleNotes.length > 0) {
           try {
             const trebleVoice = new Voice({
               num_beats: midiData!.timeSignature.numerator,
               beat_value: midiData!.timeSignature.denominator
             });
             
             trebleVoice.setStrict(false);
             trebleVoice.addTickables(trebleVoiceData.trebleNotes);
             
             const formatter = new Formatter();
             formatter.joinVoices([trebleVoice]).format([trebleVoice], MEASURE_WIDTH - 100);
             
             trebleVoice.draw(context, trebleStave);
             addClickHandlersToNotes(trebleVoiceData.trebleMetadata, 'treble', newClickableElements);
             
             // Add beams
             const beamedElements = createIntelligentBeams(trebleVoiceData.trebleNotes, midiData!.timeSignature);
             beamedElements.forEach(element => {
               try {
                 if (element instanceof Beam) {
                   element.setContext(context).draw();
                 }
               } catch (error) {
                 console.warn('Treble beam error:', error);
               }
             });
           } catch (error) {
             console.warn('Treble voice error:', error);
           }
         }
         
         // Process bass clef
         const bassVoiceData = createMeasureVoices(measure, 'bass', midiData!);
         if (bassVoiceData.bassNotes.length > 0) {
           try {
             const bassVoice = new Voice({
               num_beats: midiData!.timeSignature.numerator,
               beat_value: midiData!.timeSignature.denominator
             });
             
             bassVoice.setStrict(false);
             bassVoice.addTickables(bassVoiceData.bassNotes);
             
             const formatter = new Formatter();
             formatter.joinVoices([bassVoice]).format([bassVoice], MEASURE_WIDTH - 100);
             
             bassVoice.draw(context, bassStave);
             addClickHandlersToNotes(bassVoiceData.bassMetadata, 'bass', newClickableElements);
             
             // Add beams
             const beamedElements = createIntelligentBeams(bassVoiceData.bassNotes, midiData!.timeSignature);
             beamedElements.forEach(element => {
               try {
                 if (element instanceof Beam) {
                   element.setContext(context).draw();
                 }
               } catch (error) {
                 console.warn('Bass beam error:', error);
               }
             });
           } catch (error) {
             console.warn('Bass voice error:', error);
           }
         }
       }
     }
     
     setClickableElements(newClickableElements);
     
   } catch (error) {
     console.error('Page rendering error:', error);
     if (divRef.current) {
       divRef.current.innerHTML = '<p class="text-red-500 p-4">Error rendering sheet music. The MIDI file may contain complex musical elements that require manual adjustment.</p>';
     }
   }
 };

 // Cleanup function
 const cleanupClickHandlers = () => {
   clickableElements.forEach(element => {
     const newElement = element.cloneNode(true) as HTMLElement;
     element.parentNode?.replaceChild(newElement, element);
   });
   setClickableElements([]);
 };

 // Main effect for processing and rendering
 useEffect(() => {
   if (!midiData || !divRef.current) return;

   cleanupClickHandlers();
   divRef.current.innerHTML = '';
   
   try {
     const processedNotes: ProcessedNote[] = midiData.notes
       .filter(note => note.noteNumber >= 21 && note.noteNumber <= 108)
       .map(note => ({
         midiNote: note.noteNumber,
         vexNote: midiNoteToVexFlowNote(note.noteNumber, midiData.keySignature),
         startTime: note.startTime,
         duration: Math.max(note.duration, midiData.ticksPerQuarter / 32),
         velocity: note.velocity,
         voice: note.noteNumber >= 60 ? 'treble' : 'bass'
       }));

     const measures = processNotesIntoMeasures(processedNotes, midiData);
     const totalPagesNeeded = Math.ceil(measures.length / MEASURES_PER_PAGE);
     setTotalPages(totalPagesNeeded);
     
     if (currentPage >= totalPagesNeeded) {
       setCurrentPage(0);
     }
     
     renderPage(measures, currentPage);
   } catch (error) {
     console.error('Processing error:', error);
     if (divRef.current) {
       divRef.current.innerHTML = '<p class="text-red-500 p-4">Error processing MIDI data. This may be due to complex musical structures that require specialized handling.</p>';
     }
   }

   return () => {
     cleanupClickHandlers();
   };
 }, [midiData, currentPage, onNoteClick]);

 // Navigation functions
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
         <h3 className="text-xl font-semibold">Professional Sheet Music</h3>
         {midiData && (
           <div className="text-sm text-gray-600 mt-1">
             <span>Key: {midiData.keyName} {midiData.keyMode}</span>
             <span className="mx-2">•</span>
             <span>Time: {midiData.timeSignature.numerator}/{midiData.timeSignature.denominator}</span>
             <span className="mx-2">•</span>
             <span>Confidence: {Math.round(midiData.confidence.key * 100)}%</span>
           </div>
         )}
       </div>
       {totalPages > 1 && (
         <div className="flex items-center gap-4">
           <button
             onClick={previousPage}
             disabled={currentPage === 0}
             className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
           >
             ← Previous
           </button>
           <span className="text-sm text-gray-600 whitespace-nowrap">
             Page {currentPage + 1} of {totalPages}
           </span>
           <button
             onClick={nextPage}
             disabled={currentPage === totalPages - 1}
             className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
           >
             Next →
           </button>
         </div>
       )}
     </div>
     
     <div className="overflow-auto border rounded-lg bg-white shadow-inner">
       <div 
         ref={divRef} 
         className="w-full h-auto p-4"
         style={{ 
           minWidth: `${CANVAS_WIDTH}px`,
           minHeight: `${CANVAS_HEIGHT}px`,
           backgroundColor: '#fefefe'
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
               className={`px-3 py-1 rounded text-sm transition-colors ${
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
             ... +{totalPages - 10} more
           </span>
         )}
       </div>
     )}
     
     <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
         <p><strong>🎼 Professional Features:</strong> Key signatures, time signatures, intelligent voice separation</p>
         <p><strong>🎹 Interactive:</strong> Click notes to highlight piano keys • Blue = Treble • Red = Bass</p>
         <p><strong>🧠 AI-Powered:</strong> Krumhansl-Schmuckler key detection • Musical context analysis</p>
         <p><strong>📊 Statistics:</strong> {clickableElements.length} interactive notes • Page {currentPage + 1}/{totalPages}</p>
       </div>
     </div>
   </div>
 );
};

export default SheetMusic;