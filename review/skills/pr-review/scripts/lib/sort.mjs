export function compare(a, b) {
  if (a < b) {
    return -1;
  }

  return a > b ? 1 : 0;
}

export function sortBy(items, ...keys) {
  return [...items].sort((a, b) => {
    for (const key of keys) {
      const order = compare(a[key], b[key]);

      if (order !== 0) {
        return order;
      }
    }

    return 0;
  });
}
