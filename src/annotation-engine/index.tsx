import React, { FC, forwardRef, ForwardedRef, useRef } from 'react';
import { Annotation, PartialAnnotationStyle, StyleDataById } from './models';
import Canvas from './style/canvas';
import Container from './style/container';
import Image from './style/image';
import InnerContainer from './style/inner-container';
import useAnnotationEngine, { Handles, OnEvent } from './use-annotation-engine';

export interface AnnotationEngineProps {
    className?: string;
    annotations: Annotation[];
    annotationToEdit?: Annotation;
    backgroundImagePath: string;
    foregroundImagePath?: string;
    id?: string;
    onEvent: OnEvent;
    styleForAnnotations: StyleDataById;
    styleForAnnotationToEdit?: PartialAnnotationStyle;
    styleForPointsToEdit?: StyleDataById;
}

const AnnotationEngine: FC<AnnotationEngineProps> = forwardRef(
    (
        {
            annotationToEdit,
            annotations = [],
            backgroundImagePath,
            className,
            foregroundImagePath,
            id = 'annotation-engine',
            onEvent,
            styleForAnnotations,
            styleForAnnotationToEdit,
            styleForPointsToEdit,
            children,
        },
        ref: ForwardedRef<Handles>,
    ) => {
        // calling conditionally a hook is not allowed, so this one will be used if {ref} is null
        const cRef = useRef<HTMLCanvasElement>(null);

        useAnnotationEngine({
            annotationToEdit,
            annotations,
            onEvent,
            canvasRef: cRef,
            ref,
            styleForAnnotations,
            styleForAnnotationToEdit,
            styleForPointsToEdit,
        });

        return (
            <Container className={className}>
                {children && <InnerContainer>{children}</InnerContainer>}
                <Image src={backgroundImagePath} />
                {foregroundImagePath && <Image src={foregroundImagePath} />}
                <Canvas ref={cRef} id={id} />
            </Container>
        );
    },
);

AnnotationEngine.displayName = 'AnnotationEngine';

export default AnnotationEngine;
