export function toHexBlock(array: number[]) {
  const maxSize = 16;
  if (array.length <= maxSize)
    return array.map((c) => c.toString(16).padStart(2, "0")).join(" ");
  else
    return (
      "\n\t\t\t\t" +
      [...array.keys()]
        .slice(0, 1 + array.length / maxSize)
        .map((i) => toHexBlock(array.slice(i * maxSize, (i + 1) * maxSize)))
        .join("\n\t\t\t\t")
    );
}
