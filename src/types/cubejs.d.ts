declare module 'cubejs' {
  class Cube {
    constructor(state?: string);
    static initSolver(): void;
    static fromString(str: string): Cube;
    static random(): Cube;
    move(algorithm: string): void;
    solve(maxDepth?: number): string;
    asString(): string;
    clone(): Cube;
    isSolved(): boolean;
  }
  export = Cube;
}
