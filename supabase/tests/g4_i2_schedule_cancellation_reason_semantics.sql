do $test$
declare
  trim_characters constant text :=
    E' \t\n\r\f'
      || chr(11)
      || chr(133)
      || chr(160)
      || chr(5760)
      || chr(8192)
      || chr(8193)
      || chr(8194)
      || chr(8195)
      || chr(8196)
      || chr(8197)
      || chr(8198)
      || chr(8199)
      || chr(8200)
      || chr(8201)
      || chr(8202)
      || chr(8232)
      || chr(8233)
      || chr(8239)
      || chr(8287)
      || chr(12288)
      || chr(65279);
  code_point integer;
  normalized text;
begin
  -- legacy_btrim_does_not_trim_tabs
  if length(btrim(E'\t\n')) = 0 then
    raise exception 'Expected legacy btrim reproduction to retain tab/newline.';
  end if;

  -- required_boundary_whitespace_is_empty
  foreach normalized in array array[
    btrim('   ', trim_characters),
    btrim(E'\t\t', trim_characters),
    btrim(E'\r\r', trim_characters),
    btrim(E'\n\n', trim_characters),
    btrim(E' \t\r\n\f ', trim_characters)
  ]
  loop
    if normalized <> '' then
      raise exception 'Boundary whitespace normalization must be empty.';
    end if;
  end loop;

  -- unicode_boundary_whitespace_is_empty
  foreach normalized in array array[
    btrim(chr(11), trim_characters),
    btrim(chr(133), trim_characters),
    btrim(chr(160), trim_characters),
    btrim(chr(8195), trim_characters),
    btrim(chr(8232), trim_characters),
    btrim(chr(8233), trim_characters),
    btrim(chr(8239), trim_characters),
    btrim(chr(12288), trim_characters),
    btrim(chr(65279), trim_characters),
    btrim(chr(133) || chr(160) || chr(8195) || chr(8239), trim_characters)
  ]
  loop
    if normalized <> '' then
      raise exception 'Unicode boundary whitespace normalization must be empty.';
    end if;
  end loop;

  -- each_frozen_code_point_is_empty
  foreach code_point in array array[
    9, 10, 11, 12, 13, 32, 133, 160, 5760,
    8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202,
    8232, 8233, 8239, 8287, 12288, 65279
  ]
  loop
    if btrim(chr(code_point), trim_characters) <> '' then
      raise exception 'Frozen whitespace code point % must normalize to empty.',
        code_point;
    end if;
  end loop;

  -- entire_unicode_whitespace_set_is_empty
  if btrim(trim_characters, trim_characters) <> '' then
    raise exception 'The complete frozen whitespace set must normalize to empty.';
  end if;

  -- zero_width_space_is_preserved
  if btrim(chr(8203), trim_characters) <> chr(8203) then
    raise exception 'U+200B must not be trimmed.';
  end if;

  -- leading_and_trailing_whitespace_is_removed
  normalized := btrim(
    chr(160) || E'\talpha\nbeta\r' || chr(8195),
    trim_characters
  );

  -- internal_newline_is_preserved
  if normalized <> E'alpha\nbeta' then
    raise exception 'Boundary trimming must preserve internal newlines.';
  end if;

  -- exactly_1_character_is_valid
  normalized := btrim(E'\tx\n', trim_characters);
  if length(normalized) not between 1 and 500 then
    raise exception 'One-character cancellation reason must be valid.';
  end if;

  -- exactly_500_characters_is_valid
  normalized := btrim(
    E'\t' || repeat('x', 500) || E'\n',
    trim_characters
  );
  if length(normalized) not between 1 and 500 then
    raise exception '500-character cancellation reason must be valid.';
  end if;

  -- more_than_500_characters_is_invalid
  normalized := btrim(
    E'\t' || repeat('x', 501) || E'\n',
    trim_characters
  );
  if length(normalized) between 1 and 500 then
    raise exception '501-character cancellation reason must be invalid.';
  end if;
end;
$test$;
