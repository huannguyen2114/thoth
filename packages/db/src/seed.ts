import type { ContentId, NewChapter, NewSegment } from "@thoth/core";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { DrizzleChapterRepository } from "./repositories/chapter-repository";
import { DrizzleSegmentRepository } from "./repositories/segment-repository";
import { contents } from "./schema";

/**
 * Two ready-made contents so feature lanes can build before ingestion exists
 * (docs/plan/parallel-development.md). Text is original sample prose, not a real transcript.
 * Idempotent: fixed IDs, re-running replaces segments and chapters.
 */
export const SAMPLE_LECTURE_ID = "sample-lecture" as ContentId;
export const SAMPLE_PDF_ID = "sample-pdf" as ContentId;

const t = (startSec: number, endSec: number) => ({ type: "time" as const, startSec, endSec });
const p = (page: number) => ({ type: "page" as const, page });

const lectureSegments: NewSegment[] = [
  [
    0,
    42,
    "Welcome. This course is about the human brain: what it does, how it is organised, and how we can study it. We start with a story that shows why the topic matters.",
  ],
  [
    42,
    106,
    "Studying the brain helps us understand ourselves. The course mixes stories, experiments and methods. Grading details are in the syllabus, so today we focus on ideas.",
  ],
  [
    106,
    600,
    "A friend wakes up one night confused and unable to find his way around a familiar house. Scans later show a slow-growing tumour pressing on a region used for navigation.",
  ],
  [
    600,
    1200,
    "After surgery he recovers most abilities, but finding his way stays hard for months. The case shows that one region can support a specific skill while other skills stay intact.",
  ],
  [
    1200,
    1702,
    "Recovery depends on the size of the damage, on timely care and on the brain's ability to adapt. Access to good doctors made a large difference in this case.",
  ],
  [
    1702,
    2057,
    "The brain is not uniform. Separate regions specialise in faces, places, language and movement. Damage to one region can remove one ability while leaving general intelligence in place.",
  ],
  [
    2057,
    2400,
    "Deep neural networks changed machine vision after 2012. They now recognise objects nearly as well as people in some tests.",
  ],
  [
    2400,
    2757,
    "Yet these networks still struggle with context and meaning. Comparing them with human vision tells us what the brain does that current AI does not.",
  ],
  [
    2757,
    2786,
    "Understanding how a physical brain produces a mind may be the greatest open question in science.",
  ],
  [
    2786,
    3300,
    "We can study the brain at many levels, from molecules and single neurons to whole networks. This course works at the level of regions and the mental functions they support.",
  ],
  [
    3300,
    4100,
    "Main methods include functional MRI, which tracks blood flow, studies of patients with brain damage, and recordings from neurons. Each method answers a different kind of question.",
  ],
].map(([s, e, text], idx) => ({ idx, text: text as string, locator: t(s as number, e as number) }));

const lectureChapters: NewChapter[] = [
  {
    idx: 0,
    title: "Introduction to the human brain",
    summary: "The course goals and why the brain is worth studying.",
    locator: t(0, 42),
  },
  {
    idx: 1,
    title: "Studying the human brain",
    summary: "How the course is structured: stories, experiments and methods.",
    locator: t(42, 106),
  },
  {
    idx: 2,
    title: "Case study: losing the way",
    summary:
      "A tumour in a navigation region impairs way-finding while other skills stay intact; recovery is partial and slow.",
    locator: t(106, 1702),
  },
  {
    idx: 3,
    title: "Brain organisation and function",
    summary:
      "Regions specialise; focal damage removes specific abilities, not general intelligence.",
    locator: t(1702, 2057),
  },
  {
    idx: 4,
    title: "Neuroscience and artificial intelligence",
    summary:
      "Deep networks see well but miss context and meaning, which highlights what brains still do better.",
    locator: t(2057, 2786),
  },
  {
    idx: 5,
    title: "Methods of brain study",
    summary:
      "Levels of analysis and the main methods: fMRI, patient studies and neural recordings.",
    locator: t(2786, 4100),
  },
];

const pdfPages = [
  "Chapter 3: Cell energy. Every cell needs energy to build molecules, move and divide. The cell stores usable energy in ATP, adenosine triphosphate.",
  "Glycolysis happens in the cytoplasm. It splits one glucose molecule into two pyruvate molecules and makes a small net gain of two ATP. It does not need oxygen.",
  "Mitochondria are the cell's power plants. They have an outer membrane and a folded inner membrane called the cristae, which gives a large surface for energy reactions.",
  "In the Krebs cycle, inside the mitochondrial matrix, pyruvate is broken down further. The cycle releases carbon dioxide and loads electron carriers NADH and FADH2.",
  "Oxidative phosphorylation uses the electron transport chain on the inner membrane. Pumped protons flow back through ATP synthase, which produces most of the cell's ATP. Oxygen is the final electron acceptor.",
  "Without oxygen, cells fall back on fermentation, which regenerates NAD+ but yields far less ATP. This is why muscles tire quickly during intense exercise.",
];
const pdfSegments: NewSegment[] = pdfPages.map((text, i) => ({ idx: i, text, locator: p(i + 1) }));
const pdfChapters: NewChapter[] = [
  {
    idx: 0,
    title: "ATP and glycolysis",
    summary: "Why cells need ATP and how glycolysis makes a little of it without oxygen.",
    locator: p(1),
  },
  {
    idx: 1,
    title: "Mitochondria and the Krebs cycle",
    summary: "Mitochondrial structure and how the Krebs cycle loads electron carriers.",
    locator: p(3),
  },
  {
    idx: 2,
    title: "Oxidative phosphorylation and fermentation",
    summary: "How the electron transport chain makes most ATP, and what happens without oxygen.",
    locator: p(5),
  },
];

export async function seedSampleContent(db: Db): Promise<ContentId[]> {
  const samples = [
    {
      id: SAMPLE_LECTURE_ID,
      kind: "youtube" as const,
      title: "Sample: Introduction to the Human Brain",
      sourceUrl: "https://www.youtube.com/watch?v=ba-HMvDn_vU",
      segments: lectureSegments,
      chapters: lectureChapters,
    },
    {
      id: SAMPLE_PDF_ID,
      kind: "pdf" as const,
      title: "Sample: Cell Energy and Mitochondria",
      sourceUrl: null,
      segments: pdfSegments,
      chapters: pdfChapters,
    },
  ];
  const segs = new DrizzleSegmentRepository(db);
  const chaps = new DrizzleChapterRepository(db);
  for (const s of samples) {
    const existing = await db.query.contents.findFirst({ where: eq(contents.id, s.id) });
    if (!existing) {
      await db.insert(contents).values({
        id: s.id,
        spaceId: null,
        kind: s.kind,
        title: s.title,
        sourceUrl: s.sourceUrl,
        filePath: null,
        status: "ready",
      });
    }
    await segs.replaceForContent(s.id, s.segments);
    await chaps.replaceForContent(s.id, s.chapters);
  }
  return samples.map((s) => s.id);
}
