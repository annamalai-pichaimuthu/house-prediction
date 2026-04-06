package com.housing.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.stream.Collectors;

/**
 * Maps exceptions to RFC 9457 ProblemDetail responses.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** Bean Validation failures (e.g. @NotNull, @Min, @Max on WhatIfRequest) */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        String details = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.joining("; "));

        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, details);
        pd.setTitle("Validation Failed");
        pd.setType(URI.create("about:validation-error"));
        return pd;
    }

    /** ML model connectivity issues */
    @ExceptionHandler(RuntimeException.class)
    public ProblemDetail handleRuntime(RuntimeException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(
                HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage());
        pd.setTitle("Service Error");
        pd.setType(URI.create("about:service-error"));
        return pd;
    }
}
