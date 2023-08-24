import React, { useEffect, useRef, useState } from 'react';
import Select, { components } from 'react-select';
import cx from 'classnames';
import { Col, Container, OverlayTrigger, Popover, Row } from 'react-bootstrap';
import { ButtonSolid } from '@/_ui/AppButton/AppButton';
import SolidIcon from '@/_ui/Icon/SolidIcons';
import useShowPopover from '@/_hooks/useShowPopover';
import LeftOuterJoinIcon from '../../Icons/LeftOuterJoinIcon';
import RightOuterJoin from '../../Icons/RightOuterJoin';
import InnerJoinIcon from '../../Icons/InnerJoinIcon';
import FullOuterJoin from '../../Icons/FullOuterJoin';
import SelectBox from './SelectBox';

// Common :-
// - Try to make it as : Re-usable component
// - Style the Component
// - Dark Theme
// - Keydown Close the popup
// - Translation if needed

// Pending :- Join Drop Down
// - Reduce the Width
// - Different CSS Styles ( Active, Hover, Disabled )
// - Same must be used for ( Join, Operator Symbol, Multiple condition operation )
// - Selected Option Tick icon + Bg Color change
// - Now it is Un-controlled component, Make it to controlled component
// - Make the Icon component Dynamic - So that for Dark theme it might be useful

// Pending :- Drop Down for Table
// - For Join Scenario : Only on Table B - Add table button must come
// -

// Pending :- Drop Down for Table with CheckBox & Info

// Pending :- Drop Down for Table - with Multiple Column

// Customization
// 1. To customize [ Select Drop Down Menu ] - with Search, or Buttons use `Menu List Component` from React Select

export const JoinTable = React.memo(() => {
  return (
    <div>
      <JoinOperationMenu />
      <SelectTableMenu />
    </div>
  );
});

// Base Component for Join Drop Down ----------
const staticJoinOperationsList = [
  { label: 'Inner Join', value: 'inner-join' },
  { label: 'Left Join', value: 'left-join' },
  { label: 'Right Join', value: 'right-join' },
  { label: 'Full Outer Join', value: 'full-outer-join' },
];

const DBJoinIcons = ({ joinType }) => {
  switch (joinType) {
    case 'left-join':
      return <LeftOuterJoinIcon />;
    case 'inner-join':
      return <InnerJoinIcon />;
    case 'right-join':
      return <RightOuterJoin />;
    case 'full-outer-join':
      return <FullOuterJoin />;
    default:
      return '';
  }
};

const JoinOperationMenu = () => {
  const { Option, SingleValue } = components;

  const SingleValueComponent = (props) => (
    <SingleValue {...props}>
      <DBJoinIcons joinType={props.data.value} />
    </SingleValue>
  );

  const OptionWithIcons = (props) => (
    <Option {...props}>
      <DBJoinIcons joinType={props.data.value} /> <span className="ms-1 small">{props.data.label}</span>
    </Option>
  );

  return (
    <div>
      <Select
        classNames={{
          menu: () => 'tj-scrollbar',
        }}
        menuPlacement="bottom"
        placeholder="Search"
        defaultValue={staticJoinOperationsList[0]}
        options={staticJoinOperationsList}
        components={{
          SingleValue: SingleValueComponent,
          Option: OptionWithIcons,
          IndicatorSeparator: () => null,
        }}
      />
    </div>
  );
};

// Base Component for Table Drop Down ---------------
const DropdownIndicator = (props) => {
  return (
    components.DropdownIndicator && (
      <components.DropdownIndicator {...props}>
        <SolidIcon name="search" width="16px" />
      </components.DropdownIndicator>
    )
  );
};

const SelectTableMenu = () => {
  const { MenuList, Option } = components;

  const IconOptions = (props) => (
    <Option {...props}>
      <DBJoinIcons joinType={props.data.value} /> <span className="ms-1 small">{props.data.label}</span>
    </Option>
  );

  const tableList = [
    {
      label: 'Table A',
      value: 'Table A',
      id: '123',
    },
    {
      label: 'Table B',
      value: 'Table B',
      id: '2',
    },
    {
      label: 'Table C',
      value: 'Table C',
      id: '3',
    },
    {
      label: 'Table D',
      value: 'Table D',
      id: '4',
    },
    {
      label: 'Table E',
      value: 'Table E',
      id: '5',
    },
    {
      label: 'Table F',
      value: 'Table F',
      icon: 'search',
      id: '6',
    },
  ];

  return (
    <div className="field-container d-flex">
      <label className="form-label" data-cy="label-column-limit">
        Limit
      </label>
      <div className="field flex-grow-1 mt-1">
        <Container>
          <Row>
            <Col sm="6" className="text-center">
              Selected Table
            </Col>
            <Col sm="6" className="text-center">
              Joining Table
            </Col>
          </Row>
          <Row className="border rounded">
            <Col sm="2" className="p-0 border-end">
              {/* <SelectBox /> */}
            </Col>
            <Col sm="4" className="p-0 border-end">
              {/* <SelectBox /> */}
            </Col>
            <Col sm="2" className="p-0 border-end">
              {/* <SelectBox /> */}
              <DropDownSelect options={tableList} />
            </Col>
            <Col sm="4" className="p-0">
              <DropDownSelect options={tableList} isMulti />
            </Col>
          </Row>
        </Container>
      </div>
    </div>
  );
};

const DropDownSelect = ({ darkMode, disabled, options, isMulti }) => {
  const popoverId = useRef(`dd-select-${generateRandomId(10)}`);
  const popoverBtnId = useRef(`dd-select-btn-${generateRandomId(10)}`);
  const [showMenu, setShowMenu] = useShowPopover(false, `#${popoverId.current}`, `#${popoverBtnId.current}`);
  const [selected, setSelected] = useState();
  const selectRef = useRef();

  useEffect(() => {
    if (showMenu) {
      // selectRef.current.focus();
    }
  }, [showMenu]);

  return (
    <OverlayTrigger
      show={showMenu && !disabled}
      placement="top-start"
      // placement="auto"
      // arrowOffsetTop={90}
      // arrowOffsetLeft={90}
      overlay={
        <Popover
          key={'page.i'}
          id={popoverId.current}
          className={`${darkMode && 'popover-dark-themed dark-theme tj-dark-mode'}`}
          style={{ width: '244px', maxWidth: '246px' }}
        >
          <SelectBox options={options} isMulti={isMulti} onSelect={setSelected} closePopup={() => setShowMenu(false)} />
        </Popover>
      }
    >
      <span className="col-auto" id={popoverBtnId.current}>
        <ButtonSolid
          size="sm"
          variant="tertiary"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) {
              return;
            }
            setShowMenu((show) => !show);
          }}
          className="px-1 pe-3 ps-2 gap-0 w-100 border-0"
          data-cy={`show-ds-popover-button`}
        >
          {selected ? selected?.label : ' '}
        </ButtonSolid>
      </span>
    </OverlayTrigger>
  );
};

function generateRandomId(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomId = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    randomId += characters.charAt(randomIndex);
  }

  return randomId;
}
