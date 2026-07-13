// Auto-translating <Text>.
//
// WHY THIS EXISTS
// Swapping one import per screen is far safer than hand-editing ~900 string
// literals. This component ONLY touches what is rendered — it can never reach an
// AsyncStorage key, a database value ('Intellectual', 'he/him'), an API mode
// ('daily-reflection'), or an animal name used as data. Those stay untouched.
//
// SAFETY
//   • Untranslated text renders in English, byte-identical to today. Wrapping is a
//     no-op until translations exist.
//   • Only a plain string child is translated. Interpolated/nested children pass
//     through unchanged.
//   • `raw` skips translation entirely — use it for user-typed and AI-generated
//     content, so a user writing "continue" is never silently translated.
//   • Re-renders automatically when the language changes.

import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { t, useT } from '@/constants/i18n';

export type AppTextProps = TextProps & {
  /** Skip translation. Use for user-generated or AI-generated content. */
  raw?: boolean;
};

export const Text = React.forwardRef<any, AppTextProps>(function Text(
  { children, raw, ...rest },
  ref,
) {
  useT(); // subscribe: re-render this text when the language changes

  const content =
    !raw && typeof children === 'string' ? t(children) : children;

  return (
    <RNText ref={ref} {...rest}>
      {content}
    </RNText>
  );
});

export default Text;
