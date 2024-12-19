/* eslint-disable import/no-extraneous-dependencies */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import debounce from 'lodash.debounce'
import {
  type OptionValue,
  Combobox,
  Field,
  IComboboxProps,
  Option,
} from '@zendeskgarden/react-dropdowns'
import { Grid as GardenGrid } from '@zendeskgarden/react-grid'
import { ThemeProvider } from '@zendeskgarden/react-theming'
import { type FilterOption, FILTER_OPTIONS } from '../constants'

export interface MultiSelectProps {
  setState: React.Dispatch<React.SetStateAction<Record<FilterOption, boolean>>>
  state: Record<string, boolean>
}

const MultiSelect: React.FC<MultiSelectProps> = ({ state, setState }) => {
  const [options, setOptions] = useState(FILTER_OPTIONS)

  const handleChange = useCallback<NonNullable<IComboboxProps['onChange']>>(
    ({ selectionValue, inputValue, type }) => {
      if (!Array.isArray(selectionValue)) return

      FILTER_OPTIONS.forEach((option) => {
        handleOption({
          selectionValue,
          setter: setState,
          type,
          text: option,
        })
      })

      if (inputValue !== undefined) {
        if (inputValue === '') {
          setOptions(FILTER_OPTIONS)
        } else {
          const regex = new RegExp(
            inputValue.replace(/[.*+?^${}()|[\]\\]/giu, '\\$&'),
            'giu',
          )

          setOptions(FILTER_OPTIONS.filter((option) => option.match(regex)))
        }
      }
    },
    [setState],
  )

  const debounceHandleChange = useMemo(
    () => debounce(handleChange, 150),
    [handleChange],
  )

  useEffect(
    () => () => void debounceHandleChange.cancel(),
    [debounceHandleChange],
  )

  return (
    <ThemeProvider>
      <GardenGrid.Row justifyContent="center">
        <GardenGrid.Col sm={13}>
          <Field>
            <Field.Label>Filter</Field.Label>
            <Combobox
              isAutocomplete
              isMultiselectable
              maxHeight="auto"
              listboxMaxHeight="100px"
              listboxMinHeight="10px"
              onChange={debounceHandleChange}
            >
              {options.length === 0 ? (
                <Option isDisabled label="" value="No matches found" />
              ) : (
                options.map((value) => (
                  <Option key={value} value={value} isSelected={state[value]} />
                ))
              )}
            </Combobox>
          </Field>
        </GardenGrid.Col>
      </GardenGrid.Row>
    </ThemeProvider>
  )
}

function handleOption({
  selectionValue,
  setter,
  type,
  text,
}: {
  selectionValue: OptionValue[]
  setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  type: string
  text: string
}) {
  if (selectionValue?.includes(text)) {
    setter((prev) => ({ ...prev, [text]: true }))
  } else if (
    !selectionValue?.includes(text) &&
    (type === 'input:keyDown:Enter' ||
      type === 'option:click' ||
      type === 'fn:setSelectionValue')
  ) {
    setter((prev) => ({ ...prev, [text]: false }))
  }
}

export default MultiSelect
