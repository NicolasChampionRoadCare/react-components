import { Story, Meta } from '@storybook/react';
import React from 'react';
import styled from 'styled-components';
import { AnnotationEngineProps, UseAnnotationEngineArgs } from '..';
import AnnotationEngine, { useAnnotationEngine } from '.';

export default {
    title: 'Components/Annotation Engine',
    component: AnnotationEngine,
    argTypes: {
        onAnnotationEnd: { action: 'Annotation end' },
        onAnnotationEdit: { action: 'Annotation edit' },
    },
    args: {
        width: 539,
        height: 750,
        backgroundImgPath: 'https://posterstore.fr/images/zoom/mountain-road.jpg',
        annotations: [],
    },
} as Meta;

interface StyledProps extends AnnotationEngineProps {
    width: number;
    height: number;
}

interface StyledArgs extends UseAnnotationEngineArgs {
    width: number;
    height: number;
}

const StyledAnnotationEngine = styled(AnnotationEngine)<StyledProps>`
    width: ${({ width }) => width}px;
    height: ${({ height }) => height}px;
`;

const Template: Story<StyledArgs> = ({ width, height, ...args }) => {
    const props = useAnnotationEngine(args);

    return <StyledAnnotationEngine height={height} width={width} {...props} />;
};

export const WithBackgroundImage = Template.bind({});

export const WithForegroundImage = Template.bind({});
WithForegroundImage.args = {
    foregroundImagePath: 'https://www.dataplusscience.com/images/5x5grid.png',
};

export const WithAnnotations = Template.bind({});
WithAnnotations.args = {
    annotations: [
        {
            name: 'Mesure TEST TEST 1',
            coordinates: [
                { x: 100, y: 200 },
                { x: 300, y: 200 },
            ],
        },
        {
            name: 'Mesure 2',
            coordinates: [
                { x: 200, y: 300 },
                { x: 300, y: 500 },
            ],
        },
        {
            name: 'Mesure 3',
            coordinates: [
                { x: 300, y: 250 },
                { x: 450, y: 300 },
                { x: 440, y: 350 },
                { x: 290, y: 400 },
                { x: 300, y: 250 },
            ],
        },
    ],
};
