do $test$
declare
  trim_pattern constant text := E'^[ \t\r\n\f]+|[ \t\r\n\f]+$';
  normalized text;
begin
  -- legacy_btrim_does_not_trim_tabs
  if length(btrim(E'\t\n')) = 0 then
    raise exception 'Expected legacy btrim reproduction to retain tab/newline.';
  end if;

  -- required_boundary_whitespace_is_empty
  foreach normalized in array array[
    regexp_replace('   ', trim_pattern, '', 'g'),
    regexp_replace(E'\t\t', trim_pattern, '', 'g'),
    regexp_replace(E'\r\r', trim_pattern, '', 'g'),
    regexp_replace(E'\n\n', trim_pattern, '', 'g'),
    regexp_replace(E' \t\r\n\f ', trim_pattern, '', 'g')
  ]
  loop
    if normalized <> '' then
      raise exception 'Boundary whitespace normalization must be empty.';
    end if;
  end loop;

  -- leading_and_trailing_whitespace_is_removed
  normalized := regexp_replace(
    E' \talpha\nbeta\r ',
    trim_pattern,
    '',
    'g'
  );

  -- internal_newline_is_preserved
  if normalized <> E'alpha\nbeta' then
    raise exception 'Boundary trimming must preserve internal newlines.';
  end if;

  -- exactly_1_character_is_valid
  normalized := regexp_replace(E'\tx\n', trim_pattern, '', 'g');
  if length(normalized) not between 1 and 500 then
    raise exception 'One-character cancellation reason must be valid.';
  end if;

  -- exactly_500_characters_is_valid
  normalized := regexp_replace(
    E'\t' || repeat('x', 500) || E'\n',
    trim_pattern,
    '',
    'g'
  );
  if length(normalized) not between 1 and 500 then
    raise exception '500-character cancellation reason must be valid.';
  end if;

  -- more_than_500_characters_is_invalid
  normalized := regexp_replace(
    E'\t' || repeat('x', 501) || E'\n',
    trim_pattern,
    '',
    'g'
  );
  if length(normalized) between 1 and 500 then
    raise exception '501-character cancellation reason must be invalid.';
  end if;
end;
$test$;
