export interface SpokenlyTranscription {
  id: string;
  text: string;
  creationDate: number; // CoreFoundation timestamp
  duration: number; // seconds
  modelId: string;
  audioPath: string;
  audioSize: number;
}

export enum DateFilter {
  All = "all",
  Today = "today",
  Yesterday = "yesterday",
  Week = "week",
}
