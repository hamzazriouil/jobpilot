-- Fallback used ONLY when the pgvector build for PGlite is not available
-- (see tests/helpers.ts). Emulates the bits of pgvector the schema uses:
-- the `extensions.vector` type (as real[]) and the cosine distance operator.
-- The HNSW index cannot be emulated and is skipped in this mode.
create domain extensions.vector as real[];

create function extensions.cosine_distance(a real[], b real[])
returns double precision language sql immutable as $$
  select 1 - sum(x * y) / (sqrt(sum(x * x)) * sqrt(sum(y * y)))
  from unnest(a, b) as t(x, y)
$$;

create operator extensions.<=> (
  leftarg  = real[],
  rightarg = real[],
  function = extensions.cosine_distance
);
